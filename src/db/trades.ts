// src/db/trades.ts
import { getDB } from "./storage";

export type TradeStatus = "OPEN" | "CLOSED";
export type TradeSide = "BUY" | "SELL";

export type Trade = {
  id: number;
  pair: string;
  side: TradeSide;
  entry_price: number;
  exit_price: number | null;
  amount: number; // en crypto (ex: 0.01 BTC)
  invested: number; // en fiat (ex: EUR)
  stop_loss: number | null;
  take_profit: number | null;
  status: TradeStatus;
  opened_at: string; // DATETIME (SQLite)
  closed_at: string | null;
  pnl: number | null; // en fiat
};

export type NewTrade = {
  pair: string;
  side: TradeSide;
  entry_price: number;
  amount: number;
  invested: number;
  stop_loss?: number;
  take_profit?: number;
  opened_at?: string; // optionnel; sinon CURRENT_TIMESTAMP
};

export type CloseTradeOptions = {
  exit_price: number;
  closed_at?: string; // optionnel; sinon CURRENT_TIMESTAMP
};

/** Ouvre un trade (INSERT). Retourne l'id créé. */
export function openTrade(t: NewTrade): number {
  const db = getDB();
  const stmt = db.prepare(`
    INSERT INTO trades (
      pair, side, entry_price, amount, invested,
      stop_loss, take_profit, status, opened_at
    ) VALUES (
      @pair, @side, @entry_price, @amount, @invested,
      @stop_loss, @take_profit, 'OPEN', COALESCE(@opened_at, CURRENT_TIMESTAMP)
    )
  `);

  const info = stmt.run({
    pair: t.pair,
    side: t.side,
    entry_price: t.entry_price,
    amount: t.amount,
    invested: t.invested,
    stop_loss: t.stop_loss ?? null,
    take_profit: t.take_profit ?? null,
    opened_at: t.opened_at ?? null,
  });

  return Number(info.lastInsertRowid);
}

/** Récupère un trade par id. */
export function getTradeById(id: number): Trade | undefined {
  const db = getDB();
  const row = db
    .prepare<unknown[], Trade>(`SELECT * FROM trades WHERE id = ?`)
    .get(id);
  return row ?? undefined;
}

/** Liste des trades, avec filtres simples. */
export function listTrades(params?: {
  pair?: string;
  status?: TradeStatus;
  limit?: number;
  offset?: number;
}): Trade[] {
  const db = getDB();
  const where: string[] = [];
  const args: any[] = [];

  if (params?.pair) {
    where.push("pair = ?");
    args.push(params.pair);
  }
  if (params?.status) {
    where.push("status = ?");
    args.push(params.status);
  }

  const limit = Math.max(0, params?.limit ?? 100);
  const offset = Math.max(0, params?.offset ?? 0);

  const sql = `
    SELECT *
    FROM trades
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY opened_at DESC, id DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const rows = db.prepare<unknown[], Trade>(sql).all(...args) as Trade[];
  return rows;
}

/** Retourne les trades ouverts, optionnellement filtrés par paire. */
export function getOpenTrades(pair?: string): Trade[] {
  if (pair) return listTrades({ status: "OPEN", pair, limit: 1000 });
  return listTrades({ status: "OPEN", limit: 1000 });
}

/**
 * Ferme un trade (UPDATE) et calcule le PnL en fiat.
 * PnL = (exit - entry) * amount   pour un BUY
 *     = (entry - exit) * amount   pour un SELL
 */
export function closeTrade(id: number, opts: CloseTradeOptions): Trade {
  const db = getDB();

  // Charger le trade pour calculer le PnL
  const t = getTradeById(id);
  if (!t) {
    throw new Error(`[trades] Trade introuvable id=${id}`);
  }
  if (t.status !== "OPEN") {
    throw new Error(`[trades] Trade déjà fermé id=${id}`);
  }

  const { exit_price, closed_at } = opts;

  const pnl =
    t.side === "BUY"
      ? (exit_price - t.entry_price) * t.amount
      : (t.entry_price - exit_price) * t.amount;

  const upd = db.prepare(`
    UPDATE trades
       SET exit_price = @exit_price,
           closed_at  = COALESCE(@closed_at, CURRENT_TIMESTAMP),
           status     = 'CLOSED',
           pnl        = @pnl
     WHERE id = @id AND status = 'OPEN'
  `);

  const info = upd.run({
    id,
    exit_price,
    closed_at: closed_at ?? null,
    pnl,
  });

  if (info.changes !== 1) {
    throw new Error(
      `[trades] Échec fermeture trade id=${id} (aucune ligne modifiée)`,
    );
  }

  const updated = getTradeById(id);
  if (!updated) {
    throw new Error(`[trades] Trade fermé mais non relu id=${id}`);
  }
  return updated;
}

/** Supprime un trade (utile en nettoyage de tests). */
export function deleteTrade(id: number): void {
  const db = getDB();
  const info = db.prepare(`DELETE FROM trades WHERE id = ?`).run(id);
  if (info.changes !== 1) {
    throw new Error(`[trades] Suppression: aucune ligne affectée id=${id}`);
  }
}
