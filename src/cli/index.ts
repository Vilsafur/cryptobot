// src/cli/index.ts

import { cmdFetch } from "../action/fetch";
import { cmdSimulate } from "../action/simulate";
import { config, validateLiveConfig } from "../config";
import { getPairList } from "../db/pairs";
import { closeLogger, debug, err, log, warn } from "../tools/logger";

const printHelp = () => {
  console.log(`
Usage: tsx src/cli/index.ts [command]

Commands:
  simulate    (placeholder) lance la simulation
  live        (placeholder) lance le mode live
  fetch       (placeholder) récupère les données OHLC
  help        affiche cette aide

Pour l'instant, ce binaire se contente d'afficher la configuration et quelques logs de base.
`);
};

const main = async () => {
  const cmd = (process.argv[2] ?? "").toLowerCase();
  const pairs = getPairList();

  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    printHelp();
    return;
  }

  // Affichage d'entête
  log("=== Kraken Bot CLI ===");
  log(
    "Mode logs:",
    config.logs.mode,
    "| JSON:",
    String(config.logs.json),
    "| DEBUG:",
    String(config.logs.debug),
  );

  // Rappel configuration principale
  log("Base fiat:", config.baseFiat);
  log("Paires configurées:", pairs.join(", "));
  log("DB path:", config.dbPath);
  log(
    "Rétention (jours): full =",
    config.retention.fullDays,
    ", half =",
    config.retention.halfDays,
    ", sixth =",
    config.retention.sixthDays,
  );
  log("Exécution: DRY_RUN =", String(config.dryRun));
  debug(
    "Intervalle simulation (min):",
    config.simIntervalMin,
    " | Candles:",
    config.simCandles,
  );

  // Validation minimale si live sans dry-run
  try {
    validateLiveConfig();
  } catch (e: any) {
    warn(
      "Configuration live incomplète (ok si DRY_RUN=true). Détail:",
      e?.message ?? e,
    );
  }

  // Placeholder de commandes (pour plus tard)
  switch (cmd) {
    case "simulate":
      await cmdSimulate();
      break;
    case "live":
      log("[live] (placeholder) Le mode live sera implémenté ultérieurement.");
      break;
    case "fetch":
      await cmdFetch();
      break;
    case "":
      log('Aucune commande fournie. Utilise "help" pour l’aide.');
      break;
    default:
      warn(`Commande inconnue: "${cmd}". Utilise "help" pour l’aide.`);
  }
};

main()
  .catch((e) => {
    err("Erreur inattendue:", e instanceof Error ? e.stack || e.message : e);
    process.exitCode = 1;
  })
  .finally(() => {
    closeLogger();
  });
