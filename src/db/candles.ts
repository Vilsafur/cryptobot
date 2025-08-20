import { FOUR_HOURS_SECS, nowSecs } from "../config";
import { debug, warn } from "../tools/logger";
import { getDB } from "./storage";

export type DBCandle = {
  time: number; // epoch (s), aligné 4h
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

/** Retourne le dernier timestamp (s) connu pour une paire, ou null. */
export const getLastCandleTime = (pair: string): number | null => {
  const row = getDB()
    .prepare(
      `SELECT time FROM candles WHERE pair = ? ORDER BY time DESC LIMIT 1`,
    )
    .get(pair) as { time: number } | undefined;
  return row?.time ?? null;
};

/** Upsert d'une bougie (INSERT OR REPLACE sur PK (pair,time)). */
export const upsertCandle = (pair: string, c: DBCandle): void => {
  if (c.time % FOUR_HOURS_SECS !== 0) return; // sécurité alignement 4h
  getDB()
    .prepare(`
      INSERT OR REPLACE INTO candles (pair, time, open, high, low, close, volume)
      VALUES (@pair, @time, @open, @high, @low, @close, @volume)
    `)
    .run({
      pair,
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    });
};

/** Upsert en batch. Retourne le nombre de lignes affectées. */
export const upsertCandles = (pair: string, candles: DBCandle[]): number => {
  if (candles.length === 0) return 0;

  const filtered = candles.filter((c) => c.time % FOUR_HOURS_SECS === 0);

  const stmt = getDB().prepare(`
    INSERT OR REPLACE INTO candles (pair, time, open, high, low, close, volume)
    VALUES (@pair, @time, @open, @high, @low, @close, @volume)
  `);

  const tx = getDB().transaction((rows: DBCandle[]) => {
    let n = 0;
    for (const r of rows) {
      stmt.run({
        pair,
        time: r.time,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
      });
      n++;
    }
    return n;
  });

  const inserted = tx(filtered);
  debug(
    `[storage] upsertCandles ${pair}: in=${candles.length} kept=${filtered.length} ins=${inserted}`,
  );
  return inserted;
};

/** Récupère les DERNIÈRES bougies (affichées en ASC). since en secondes epoch. */
export const getCandles = (
  pair: string,
  since?: number,
  limit = 500,
): DBCandle[] => {
  const db = getDB();
  // biome-ignore lint/suspicious/noExplicitAny: Non-typed params pour flexibilité
  const params: any[] = [pair];

  // WHERE commun
  let where = `pair = ?`;
  if (since != null) {
    where += ` AND time >= ?`;
    params.push(since);
  }

  // On prend les N dernières en DESC, puis on réordonne en ASC pour l'appelant
  const inner = `
    SELECT time, open, high, low, close, volume
    FROM candles
    WHERE ${where}
    ORDER BY time DESC
    LIMIT ?
  `;
  params.push(limit);

  const sql = `
    SELECT *
    FROM (${inner}) AS t
    ORDER BY time ASC
  `;

  return db.prepare(sql).all(...params) as DBCandle[];
};

/** Compte le nombre de bougies pour une paire (option: bornes). */
export const countCandles = (
  pair: string,
  since?: number,
  until?: number,
): number => {
  let sql = `SELECT COUNT(*) as n FROM candles WHERE pair = ?`;
  // biome-ignore lint/suspicious/noExplicitAny: Non-typed params pour flexibilité
  const params: any[] = [pair];
  if (since != null) {
    sql += ` AND time >= ?`;
    params.push(since);
  }
  if (until != null) {
    sql += ` AND time < ?`;
    params.push(until);
  }
  const row = getDB()
    .prepare(sql)
    .get(...params) as { n: number };
  return row.n;
};

/**
 * Vérifie qu'on a au moins 7 jours (42 bougies 4h) CONTIGÜS et récents.
 * - Contiguïté: chaque bougie espacée de 4h
 * - Fraîcheur: dernière bougie à moins de 8h
 */
export const hasMinWeeklyHistory = (pair: string): boolean => {
  const needed = 42;
  const rows = getCandles(pair, undefined, needed);
  if (rows.length < needed) {
    warn(
      `[storage] hasMinWeeklyHistory: not enough candles for ${pair}, found ${rows.length} < ${needed}`,
    );
    return false;
  }

  for (let i = 1; i < rows.length; i++) {
    if (rows[i].time - rows[i - 1].time !== FOUR_HOURS_SECS) {
      warn(
        `[storage] hasMinWeeklyHistory: candles not contiguous for ${pair}, gap at index ${i}`,
      );
      return false;
    }
  }
  const last = rows[rows.length - 1].time;
  if (!(nowSecs() - last <= 2 * FOUR_HOURS_SECS)) {
    warn(
      `[storage] hasMinWeeklyHistory: last candle too old for ${pair}, ${nowSecs()} - ${last} > ${2 * FOUR_HOURS_SECS} secs`,
    );
    return false;
  }
  return nowSecs() - last <= 2 * FOUR_HOURS_SECS; // ≤ 8h
};
