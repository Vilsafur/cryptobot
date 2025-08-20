import { getOHLC, getServerTime } from "../api/kraken";
import { config, FOUR_HOURS_SECS } from "../config";
import { getLastCandleTime, upsertCandles } from "../db/candles";
import { getPairList } from "../db/pairs";
import { debug, log, warn } from "../tools/logger";

/** Une passe de fetch pour toutes les paires configurées. */
const fetchOnceForAllPairs = async () => {
  // Optionnel: ping serveur, utile pour vérifier la latence / santé
  const serverTime = await getServerTime();
  debug("[fetch] serverTime=", serverTime);

  const pairs = getPairList();
  for (const pair of pairs) {
    try {
      const last = getLastCandleTime(pair); // epoch(s) ou null
      const since = last ?? undefined;

      const candles = await getOHLC(pair, 240, since);

      // Garder seulement les bougies strictement > last (si défini)
      const newCandles = candles.filter((c) =>
        last == null ? true : c.time > last,
      );

      const inserted = upsertCandles(pair, newCandles);

      if (inserted > 0) {
        const firstT = newCandles[0]?.time;
        const lastT = newCandles[newCandles.length - 1]?.time;
        log(
          `[fetch] ${pair}: +${inserted} bougie(s) [${firstT ?? "-"} .. ${lastT ?? "-"}]`,
        );
      } else {
        debug(
          `[fetch] ${pair}: aucune nouvelle bougie (last=${last ?? "none"})`,
        );
      }
    } catch (e: any) {
      warn(`[fetch] ${pair}: échec`, e?.message ?? e);
    }
  }
};

/** Boucle de fetch périodique. S'arrête proprement sur SIGINT/SIGTERM. */
const fetchLoop = async () => {
  const intervalMs = Math.max(5, config.fetch.intervalSec) * 1000;
  const pairs = getPairList();

  log(
    `--- FETCH LOOP --- interval=${config.fetch.intervalSec}s | onStart=${String(config.fetch.onStart)} | pairs=${pairs.join(",")}`,
  );

  let stopping = false;
  const stop = (sig: string) => {
    if (stopping) return;
    stopping = true;
    log(
      `[fetch] Arrêt demandé (${sig}). On termine la passe en cours puis on sort.`,
    );
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  if (config.fetch.onStart) {
    await fetchOnceForAllPairs();
  }

  while (!stopping) {
    await new Promise((r) => setTimeout(r, intervalMs));
    if (stopping) break;
    await fetchOnceForAllPairs();
  }

  log("[fetch] Boucle stoppée.");
};

export const cmdFetch = async () => {
  // Sanity checks basiques
  if (config.simIntervalMin !== 240) {
    warn(
      `SIM_INTERVAL_MIN=${config.simIntervalMin} (recommandé: 240 pour des bougies 4h).`,
    );
  }
  // Optionnel: vérifier alignement de la prochaine bougie 4h
  const now = Math.floor(Date.now() / 1000);
  const toNext4h = FOUR_HOURS_SECS - (now % FOUR_HOURS_SECS);
  debug(`[fetch] secondes jusqu'à la prochaine frontière 4h: ${toNext4h}`);

  await fetchLoop();
};
