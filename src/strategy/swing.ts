// src/strategy/swing.ts
import type { DBCandle } from "../db/candles";
import { getDB } from "../db/storage";
import { closeTrade, getOpenTrades, openTrade, type Trade } from "../db/trades";
import { debug, log, warn } from "../tools/logger";

/* =========================
 * Types & helpers
 * ========================= */

export type PairSettings = {
  pair: string;
  max_invest_fiat: number;
  max_per_tx_fiat: number;
  take_profit_pct: number; // ex: 0.06 (6%)
  stop_loss_pct: number; // ex: 0.03 (3%)
};

export type SwingParams = {
  maShort: number; // ex: 10
  maLong: number; // ex: 42
  lookback: number; // nombre max de bougies à charger (ex: 300)
  mode: "simulation" | "real";
};

export type SwingAction =
  | { kind: "HOLD"; reason: "NO_SIGNAL" | "NO_BUDGET" | "NOT_ENOUGH_HISTORY" }
  | {
      kind: "BUY";
      price: number;
      qty: number;
      invest: number;
      sl?: number | null;
      tp?: number | null;
      ts?: number;
    }
  | {
      kind: "SELL";
      price: number;
      reason: "SL" | "TP" | "CROSS";
      ts?: number;
      pnl?: number;
    };

const DEFAULT_PARAMS: SwingParams = {
  maShort: 10,
  maLong: 42,
  lookback: 300,
  mode: "simulation",
};

let openTradeSim: Trade | undefined; // pour simulation

/** Charge les paramètres de la paire depuis la table 'pairs'. */
function getPairSettings(pair: string): PairSettings {
  const db = getDB();
  const row = db
    .prepare(
      `SELECT pair, max_invest_fiat, max_per_tx_fiat, take_profit_pct, stop_loss_pct
       FROM pairs WHERE pair = ?`,
    )
    .get(pair) as PairSettings | undefined;

  if (!row) {
    throw new Error(
      `[swing] Paramètres introuvables pour la paire "${pair}" (table 'pairs').`,
    );
  }
  return row;
}

/** SMA simple (retourne un tableau de même longueur; début = NaN). */
function sma(values: number[], window: number): number[] {
  if (window <= 1) return values.slice();
  const out = Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}

// 🔧 Helper: retourne les deux DERNIERS indices (prev, cur) où a[i] et b[i] sont tous deux finis
function lastTwoFiniteIndices(
  a: number[],
  b: number[],
): [number, number] | null {
  let cur = -1,
    prev = -1;
  for (let i = a.length - 1; i >= 0; i--) {
    if (Number.isFinite(a[i]) && Number.isFinite(b[i])) {
      if (cur === -1) cur = i;
      else {
        prev = i;
        break;
      }
    }
  }
  return cur !== -1 && prev !== -1 ? [prev, cur] : null;
}

/** Croisement haussier confirmé: la MA courte passe AU‑DESSUS de la MA longue entre prev et cur. */
function isCrossUpConfirmed(shortMA: number[], longMA: number[]): boolean {
  const idx = lastTwoFiniteIndices(shortMA, longMA);
  if (!idx) return false;
  const [p, c] = idx;
  return shortMA[p] <= longMA[p] && shortMA[c] > longMA[c];
}

/** Croisement baissier confirmé: la MA courte passe EN DESSOUS de la MA longue entre prev et cur. */
function isCrossDownConfirmed(shortMA: number[], longMA: number[]): boolean {
  const idx = lastTwoFiniteIndices(shortMA, longMA);
  if (!idx) return false;
  const [p, c] = idx;
  return shortMA[p] >= longMA[p] && shortMA[c] < longMA[c];
}

/** Somme de l'investi (fiat) sur les trades OUVERTS d'une paire. */
function sumInvestedOpen(pair: string): number {
  const open = getOpenTrades(pair);
  return open.reduce((acc, t) => acc + (t.invested ?? 0), 0);
}

/** Calcule la taille d’ordre (fiat) selon plafonds. Retourne 0 si rien possible. */
function computeOrderFiatBudget(settings: PairSettings): number {
  const investedOpen = sumInvestedOpen(settings.pair);
  const remaining = Math.max(0, settings.max_invest_fiat - investedOpen);
  return Math.min(settings.max_per_tx_fiat, remaining);
}

/* =========================
 * Règles de sortie
 * ========================= */

/** Retourne true si StopLoss atteint (close <= SL). */
function isStopLossHit(t: Trade, closePrice: number): boolean {
  return t.stop_loss != null && closePrice <= t.stop_loss;
}

/** Retourne true si TakeProfit atteint (close >= TP). */
function isTakeProfitHit(t: Trade, closePrice: number): boolean {
  return t.take_profit != null && closePrice >= t.take_profit;
}

/* =========================
 * Exécution pour 1 paire (une clôture)
 * ========================= */

/**
 * Exécute la stratégie swing à la clôture courante pour UNE paire.
 * - Charge un lookback d'historique
 * - Vérifie l'historique minimal
 * - Si pas de trade ouvert: regarde un BUY
 * - Si trade ouvert: regarde SL/TP/croisement inverse
 */
export function runSwingForPairOnce(
  pair: string,
  candles: DBCandle[],
  params: SwingParams = DEFAULT_PARAMS,
): SwingAction {
  // Charger les bougies (ASC). since: assez large pour couvrir lookback
  const need = Math.max(params.maShort, params.maLong) + 1;
  if (candles.length < need) {
    warn(
      `[swing] ${pair}: pas assez de bougies pour détecter un croisement (need=${need}, have=${candles.length}).`,
    );
    return { kind: "HOLD", reason: "NOT_ENOUGH_HISTORY" };
  }

  const closes = candles.map((c) => c.close);
  const lastClose = closes[closes.length - 1];

  const maShort = sma(closes, params.maShort);
  const maLong = sma(closes, params.maLong);

  // État courant: y a-t-il un trade ouvert ?
  let openTrade: Trade | undefined;
  if (params.mode === "simulation") {
    openTrade = openTradeSim;
  } else {
    const open = getOpenTrades(pair);
    openTrade = open[0]; // on suppose 1 trade max par paire
  }

  // ---- Cas 1: on est FLAT → tenter une entrée (BUY) si cross up confirmé
  if (!openTrade) {
    const crossUp = isCrossUpConfirmed(maShort, maLong);
    if (!crossUp) {
      debug(
        `[swing] ${pair}: pas de signal d'achat (MA${params.maShort} vs MA${params.maLong}).`,
      );
      return { kind: "HOLD", reason: "NO_SIGNAL" };
    }

    // Budget dispo selon plafonds
    const settings = getPairSettings(pair);
    const fiatBudget = computeOrderFiatBudget(settings);
    if (fiatBudget <= 0) {
      warn(`[swing] ${pair}: aucun budget disponible (plafonds atteints).`);
      return { kind: "HOLD", reason: "NO_BUDGET" };
    }

    const qty = fiatBudget / lastClose;
    const sl =
      settings.stop_loss_pct > 0
        ? lastClose * (1 - settings.stop_loss_pct)
        : null;
    const tp =
      settings.take_profit_pct > 0
        ? lastClose * (1 + settings.take_profit_pct)
        : null;

    if (params.mode === "simulation") {
      log(
        `[swing][SIMULATION] BUY ${pair} @ ${lastClose.toFixed(6)} qty=${qty} invest=${fiatBudget} SL=${sl ?? "-"} TP=${tp ?? "-"}`,
      );
      openTradeSim = {
        pair,
        side: "BUY",
        entry_price: lastClose,
        amount: qty,
        invested: fiatBudget,
        stop_loss: sl ?? null,
        take_profit: tp ?? null,
        opened_at: Date.now().toString(),
        id: 1,
        exit_price: null,
        status: "OPEN",
        closed_at: null,
        pnl: null,
      };
      return {
        kind: "BUY",
        price: lastClose,
        qty,
        invest: fiatBudget,
        sl,
        tp,
        ts: candles[candles.length - 1]?.time,
      };
    }

    const id = openTradeFn(pair, lastClose, qty, fiatBudget, sl, tp);
    log(
      `[swing] BUY ${pair} #${id} @ ${lastClose.toFixed(6)} qty=${qty} invest=${fiatBudget} SL=${sl ?? "-"} TP=${tp ?? "-"}`,
    );
    return {
      kind: "BUY",
      price: lastClose,
      qty,
      invest: fiatBudget,
      sl,
      tp,
      ts: candles[candles.length - 1]?.time,
    };
  }

  // ---- Cas 2: on est LONG → gérer sorties
  const closeHitSL = isStopLossHit(openTrade, lastClose);
  const closeHitTP = isTakeProfitHit(openTrade, lastClose);
  const crossDown = isCrossDownConfirmed(maShort, maLong);

  if (!(closeHitSL || closeHitTP || crossDown)) {
    debug(
      `[swing] ${pair}: maintenir la position (close=${lastClose.toFixed(6)}).`,
    );
    return { kind: "HOLD", reason: "NO_SIGNAL" };
  }

  const reason = closeHitSL ? "SL" : closeHitTP ? "TP" : "CROSS";
  if (params.mode === "simulation") {
    const pnl =
      (lastClose - (openTrade.entry_price ?? 0)) * (openTrade.amount ?? 0);
    log(
      `[swing][SIMULATION] SELL ${pair} reason=${reason} @ ${lastClose.toFixed(6)} (trade #${openTrade.id}) PnL=${pnl.toFixed(2)}`,
    );
    openTradeSim = undefined; // fermer la position simulée
    return {
      kind: "SELL",
      price: lastClose,
      reason,
      ts: candles[candles.length - 1]?.time,
      pnl,
    };
  }

  const closed = closeTrade(openTrade.id, { exit_price: lastClose });
  log(
    `[swing] SELL ${pair} reason=${reason} @ ${lastClose.toFixed(6)} (trade #${openTrade.id}) PnL=${(closed.pnl ?? 0).toFixed(2)}`,
  );
  return {
    kind: "SELL",
    price: lastClose,
    reason,
    ts: candles[candles.length - 1]?.time,
    pnl: undefined,
  };
}

/** Helper d'ouverture (BUY) : encapsule openTrade et renvoie l'id. */
function openTradeFn(
  pair: string,
  entryPrice: number,
  qty: number,
  invested: number,
  stopLoss: number | null,
  takeProfit: number | null,
): number {
  const id = openTrade({
    pair,
    side: "BUY",
    entry_price: entryPrice,
    amount: qty,
    invested,
    stop_loss: stopLoss ?? undefined,
    take_profit: takeProfit ?? undefined,
  });
  return id;
}
