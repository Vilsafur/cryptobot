// src/config.ts
import "dotenv/config";
import { z } from "zod";

const parseBool = (v: string | undefined, def = false) => {
  if (v === undefined) return def;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y";
};

/** Schéma et defaults */
const EnvSchema = z.object({
  KRAKEN_API_KEY: z.string().optional(),
  KRAKEN_API_SECRET: z.string().optional(),

  BASE_FIAT: z.enum(["EUR", "USD"]).default("EUR"),

  // Données & simulation (4h = 240 min)
  SIM_INTERVAL_MIN: z.string().default("240"),
  SIM_CANDLES: z.string().default("500"),

  // Exécution
  DRY_RUN: z.string().default("true"),

  // Stockage & rétention
  DATA_DB_PATH: z.string().default("./data.db"),
  RETENTION_FULL_DAYS: z.string().default("30"),
  RETENTION_HALF_DAYS: z.string().default("90"),
  RETENTION_SIXTH_DAYS: z.string().default("180"),
  FETCH_INTERVAL_SEC: z.string().default("300"), // 5 min
  FETCH_ON_START: z.string().default("true"), // fetch immédiat au démarrage

  // Logger
  LOG_MODE: z.enum(["console", "files"]).default("console"),
  LOG_DIR: z.string().default("./logs"),
  LOG_JSON: z.string().default("false"),
  DEBUG: z.string().default("false"),
  LOG_INFO_NAME: z.string().default("app.log"),
  LOG_ERROR_NAME: z.string().default("error.log"),
});

const raw = EnvSchema.parse(process.env);

export type Fiat = "EUR" | "USD";

export type Config = {
  // Auth Kraken
  apiKey?: string;
  apiSecret?: string;

  // Général
  baseFiat: Fiat;

  // Données & simulation
  simIntervalMin: number; // minutes (240 = 4h)
  simCandles: number;

  // Exécution
  dryRun: boolean;

  // Stockage & rétention
  dbPath: string;
  retention: {
    fullDays: number; // garder toutes les bougies (0 → fullDays)
    halfDays: number; // 1/2 densité (fullDays → halfDays)
    sixthDays: number; // 1/6 densité (halfDays → sixthDays)
  };

  logs: {
    mode: string;
    dir: string;
    json: boolean;
    debug: boolean;
    infoName: string;
    errorName: string;
  };

  fetch: {
    intervalSec: number;
    onStart: boolean;
  };

  purge: {
    fullRetentionDays: number;
    downsampleUntilDays: number;
    downsampleFactor: number;
  };
};

export const config: Config = {
  apiKey: raw.KRAKEN_API_KEY,
  apiSecret: raw.KRAKEN_API_SECRET,

  baseFiat: raw.BASE_FIAT,

  simIntervalMin: Number(raw.SIM_INTERVAL_MIN),
  simCandles: Number(raw.SIM_CANDLES),

  dryRun: parseBool(raw.DRY_RUN, true),

  dbPath: raw.DATA_DB_PATH,
  retention: {
    fullDays: Number(raw.RETENTION_FULL_DAYS),
    halfDays: Number(raw.RETENTION_HALF_DAYS),
    sixthDays: Number(raw.RETENTION_SIXTH_DAYS),
  },

  logs: {
    mode: raw.LOG_MODE,
    dir: raw.LOG_DIR,
    json: raw.LOG_JSON.toLowerCase() === "true",
    debug: raw.DEBUG.toLowerCase() === "true",
    infoName: raw.LOG_INFO_NAME,
    errorName: raw.LOG_ERROR_NAME,
  },

  fetch: {
    intervalSec: Number(raw.FETCH_INTERVAL_SEC),
    onStart: raw.FETCH_ON_START.toLowerCase() === "true",
  },

  purge: {
    fullRetentionDays: 30, // garder toutes les bougies
    downsampleUntilDays: 180, // conserver échantillonné jusqu'à 6 mois
    downsampleFactor: 2, // on garde 1 bougie sur 2
  },
};

// Petits helpers utiles partout
export const FOUR_HOURS_SECS = 4 * 60 * 60; // 14400
export const nowSecs = () => Math.floor(Date.now() / 1000);
export const assertEnv = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(`[config] ${msg}`);
};

// Conseillé avant le live: s'assurer que les clés existent si DRY_RUN=false
export function validateLiveConfig() {
  if (!config.dryRun) {
    assertEnv(config.apiKey, "KRAKEN_API_KEY manquante");
    assertEnv(config.apiSecret, "KRAKEN_API_SECRET manquante");
  }
}
