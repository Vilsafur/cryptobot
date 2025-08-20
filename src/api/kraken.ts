// src/api/kraken.ts
import axios from "axios";
import { debug, warn } from "../tools/logger";

const BASE = "https://api.kraken.com";

// ----------------------
// Types de retour utiles
// ----------------------
export type Candle = {
  time: number; // epoch (s)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Ticker = {
  last: number; // prix de la dernière transaction
  ask: number; // meilleur ask
  bid: number; // meilleur bid
  time: number; // epoch (ms)
};

export type AssetPairInfo = {
  internalKey: string; // e.g. "XXBTZEUR"
  prettyPair: string; // e.g. "XBT/EUR"
  base: string; // e.g. "XBT"
  quote: string; // e.g. "EUR"
  pair_decimals?: number;
  lot_decimals?: number;
  ordermin?: string; // quantité minimale (si fournie par Kraken)
};

// -------------------------------------------------
// Helpers de normalisation et cache des paires
// -------------------------------------------------
function normalizeAsset(code: string): string {
  // Kraken préfixe souvent les actifs avec X/Z (ex: XXBT, ZEUR)
  // On enlève les préfixes initiaux X/Z pour obtenir XBT/EUR/…
  return code.replace(/^[XZ]/, "");
}

function prettyPairFromEntry(entry: { base: string; quote: string }): string {
  const base = normalizeAsset(entry.base);
  const quote = normalizeAsset(entry.quote);
  return `${base}/${quote}`;
}

let pairsCache: {
  byPretty: Map<string, AssetPairInfo>;
  byInternal: Map<string, AssetPairInfo>;
  fetchedAt: number;
} | null = null;

async function publicGet<T>(
  path: string,
  // biome-ignore lint/suspicious/noExplicitAny: Non-typed params pour flexibilité
  params?: Record<string, any>,
): Promise<T> {
  const url = `${BASE}${path}`;
  const { data } = await axios.get(url, { params, timeout: 15000 });

  if (data?.error && Array.isArray(data.error) && data.error.length > 0) {
    throw new Error(data.error.join(", "));
  }
  return data.result as T;
}

// -------------------------------------------------
// Appels PUBLICS
// -------------------------------------------------
export async function getServerTime(): Promise<number> {
  const res = await publicGet<{ unixtime: number; rfc1123: string }>(
    "/0/public/Time",
  );
  return res.unixtime;
}

/**
 * Récupère et met en cache la liste des paires Kraken,
 * avec mapping "XBT/EUR" <-> "XXBTZEUR".
 */
export async function getAssetPairs(): Promise<Map<string, AssetPairInfo>> {
  const now = Date.now();
  // Cache 5 minutes
  if (pairsCache && now - pairsCache.fetchedAt < 5 * 60 * 1000) {
    return pairsCache.byPretty;
  }

  type PairsResp = Record<
    string,
    {
      base: string;
      quote: string;
      pair_decimals?: number;
      lot_decimals?: number;
      ordermin?: string;
    }
  >;

  const raw = await publicGet<PairsResp>("/0/public/AssetPairs");

  const byPretty = new Map<string, AssetPairInfo>();
  const byInternal = new Map<string, AssetPairInfo>();

  for (const [internalKey, v] of Object.entries(raw)) {
    const pretty = prettyPairFromEntry(v);
    const info: AssetPairInfo = {
      internalKey,
      prettyPair: pretty,
      base: normalizeAsset(v.base),
      quote: normalizeAsset(v.quote),
      pair_decimals: v.pair_decimals,
      lot_decimals: v.lot_decimals,
      ordermin: v.ordermin,
    };

    // Un prettyPair peut théoriquement exister en plusieurs variantes internes (spot/margin…)
    // On garde la première rencontrée (suffisant pour un usage basique).
    if (!byPretty.has(pretty)) byPretty.set(pretty, info);
    if (!byInternal.has(internalKey)) byInternal.set(internalKey, info);
  }

  pairsCache = { byPretty, byInternal, fetchedAt: now };
  debug("[kraken] pairs cached:", byPretty.size);

  return byPretty;
}

/**
 * Retourne la clé interne Kraken ("XXBTZEUR") depuis une paire lisible ("XBT/EUR")
 */
async function resolveInternalPairKey(prettyPair: string): Promise<string> {
  const map = await getAssetPairs();
  const info = map.get(prettyPair);
  if (!info) {
    throw new Error(
      `Paire inconnue pour Kraken: "${prettyPair}". As-tu bien utilisé le format BASE/QUOTE (ex: XBT/EUR) ?`,
    );
  }
  return info.internalKey;
}

/**
 * Récupère les bougies OHLC sur un intervalle (minutes).
 * Par défaut : 240 min (4h).
 * Optionnel: since (epoch en secondes) pour ramener seulement les nouvelles bougies.
 */
export async function getOHLC(
  prettyPair: string,
  intervalMin = 240,
  since?: number,
): Promise<Candle[]> {
  const internalKey = await resolveInternalPairKey(prettyPair);

  type Resp = Record<
    string,
    [number, string, string, string, string, string, string, number][]
  > & { last?: number };

  const result = await publicGet<Resp>("/0/public/OHLC", {
    pair: internalKey,
    interval: intervalMin,
    since,
  });

  // Kraken peut renvoyer la clé interne comme nom de tableau
  const key =
    Object.keys(result).find((k) => k === internalKey) ??
    Object.keys(result)[0];
  // biome-ignore lint/suspicious/noExplicitAny: Non-typed rows pour flexibilité
  const rows = (result as any)[key] ?? [];

  // biome-ignore lint/suspicious/noExplicitAny: Non-typed rows pour flexibilité
  const candles: Candle[] = rows.map((r: any[]) => ({
    time: r[0], // epoch (s)
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[6]),
  }));

  return candles;
}

/**
 * Récupère le ticker (last/ask/bid) pour une paire lisible ("XBT/EUR").
 */
export async function getTicker(prettyPair: string): Promise<Ticker> {
  const internalKey = await resolveInternalPairKey(prettyPair);

  type TickerResp = Record<
    string,
    {
      c: [string, string]; // last trade [price, lot volume]
      a: [string, string, string]; // ask [price, whole lot volume, lot volume]
      b: [string, string, string]; // bid [price, whole lot volume, lot volume]
    }
  >;

  const res = await publicGet<TickerResp>("/0/public/Ticker", {
    pair: internalKey,
  });
  const key =
    Object.keys(res).find((k) => k === internalKey) ?? Object.keys(res)[0];
  // biome-ignore lint/suspicious/noExplicitAny: Non-typed rows pour flexibilité
  const t = (res as any)[key];

  if (!t?.c) {
    warn(
      '[kraken] Ticker response missing "c" for pair',
      prettyPair,
      "(internal:",
      internalKey,
      ")",
    );
  }

  return {
    last: Number(t.c?.[0] ?? NaN),
    ask: Number(t.a?.[0] ?? NaN),
    bid: Number(t.b?.[0] ?? NaN),
    time: Date.now(),
  };
}
