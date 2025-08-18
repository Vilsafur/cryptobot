// src/cli/plot.ts
import asciichart from "asciichart";
import { nowSecs } from "../config";
import { log, warn, err, closeLogger } from "../tools/logger";
import { getCandles } from "../db/candles";

type Args = {
  pair: string;
  days: number;      // période en jours
  limit: number;     // max points à afficher
  height: number;    // hauteur du graphe prix
  volHeight: number; // hauteur du graphe volume
  ma: number;        // fenêtre de la moyenne mobile longue
  ma2: number;       // fenêtre de la moyenne mobile courte
};

function parseArgs(argv: string[]): Args {
  const a: Args = { pair: "", days: 7, limit: 300, height: 15, volHeight: 8, ma: 42, ma2: 10 };
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i], next = argv[i + 1];
    if ((v === "--pair" || v === "-p") && next) { a.pair = next; i++; continue; }
    if ((v === "--days" || v === "-d") && next) { a.days = Number(next); i++; continue; }
    if ((v === "--limit" || v === "-l") && next) { a.limit = Number(next); i++; continue; }
    if ((v === "--height" || v === "-h") && next) { a.height = Number(next); i++; continue; }
    if (v === "--vol-height" && next) { a.volHeight = Math.max(2, Number(next)); i++; continue; }
    if (v === "--ma" && next) { a.ma = Math.max(1, Number(next)); i++; continue; }
    if (v === "--ma2" && next) { a.ma2 = Math.max(1, Number(next)); i++; continue; }
    if (v === "--help") {
      console.log(
`Usage: tsx src/cli/plot.ts --pair XBT/EUR [options]
Options:
  -p, --pair <PAIR>         Paire à tracer (ex: XBT/EUR)   [requis]
  -d, --days <N>            Fenêtre en jours               [défaut: 7]
  -l, --limit <N>           Max points affichés            [défaut: 300]
  -h, --height <N>          Hauteur du graphe prix         [défaut: 15]
      --vol-height <N>      Hauteur du graphe volume       [défaut: 8]
      --ma <N>              MA longue (fenêtre)            [défaut: 42]
      --ma2 <N>             MA courte (fenêtre)            [défaut: 10]`
      );
      process.exit(0);
    }
  }
  if (!a.pair) throw new Error(`--pair est requis. Exemple: --pair XBT/EUR`);
  return a;
}

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

function fmt(n: number) {
  if (!isFinite(n)) return String(n);
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) >= 10) return n.toFixed(2);
  return n.toFixed(4);
}

function printIntro(pair: string, ma: number, ma2: number) {
  console.log("=== Comment lire le graphe ===");
  console.log(
`- ${colorName("Bleu")}  : Close (prix de clôture des bougies 4h)
- ${colorName("Vert")}  : MA longue (${ma}) → tendance de fond (réagit lentement)
- ${colorName("Rouge")} : MA courte (${ma2}) → tendance court terme (réagit vite)

Règles classiques (crossover):
- Achat  : MA courte (rouge) croise et passe AU-DESSUS de la MA longue (verte)
- Vente  : MA courte (rouge) croise et passe EN DESSOUS de la MA longue (verte)

⚠️ Astuces anti-faux signaux:
- Attendre 1–2 bougies de confirmation
- Prendre en compte le volume (graphe du bas)
- Utiliser tes niveaux Take Profit / Stop Loss enregistrés pour la paire (${pair})`
  );
  console.log();
}

function colorName(name: string) {
  // juste pour que la légende soit visible même si le terminal ne colore pas les courbes
  return name;
}

async function main() {
  const args = parseArgs(process.argv);
  const since = args.days ? nowSecs() - args.days * 24 * 3600 : undefined;

  const candles = getCandles(args.pair, since, args.limit);
  if (candles.length === 0) {
    warn(`[plot] Aucune candle trouvée pour ${args.pair} sur la période demandée.`);
    return;
  }

  const closes = candles.map(c => c.close);
  const times  = candles.map(c => c.time);
  const vols   = candles.map(c => c.volume);

  const maLong  = sma(closes, args.ma);
  const maShort = sma(closes, args.ma2);

  // Synchronisation: on coupe dès le premier index où TOUT est défini
  const firstValidLong  = maLong.findIndex(Number.isFinite);
  const firstValidShort = maShort.findIndex(Number.isFinite);
  const startIdx = Math.max(0, firstValidLong, firstValidShort);

  const closesView  = closes.slice(startIdx);
  const volsView    = vols.slice(startIdx);
  const timesView   = times.slice(startIdx);
  const maLongView  = (firstValidLong  >= 0) ? maLong.slice(startIdx)  : [];
  const maShortView = (firstValidShort >= 0) ? maShort.slice(startIdx) : [];

  if (closesView.length < 2) {
    warn(`[plot] Trop peu de points à tracer (closes=${closesView.length}). Réduis --ma/--ma2 ou augmente --days/--limit.`);
    return;
  }

  const minClose = Math.min(...closesView);
  const maxClose = Math.max(...closesView);
  const firstTs = timesView[0];
  const lastTs  = timesView[timesView.length - 1];

  // Intro pédagogique AVANT les graphes
  printIntro(args.pair, args.ma, args.ma2);

  // --------- CHART PRIX (Close + MA(s)) ----------
  const priceCfg: asciichart.PlotOptions = {
    height: args.height,
    format: (x: number) => fmt(x),
    colors: [asciichart.blue, asciichart.green, asciichart.red], // close, MA long, MA court
  };

  let priceChart = "";
  if (maLongView.length > 0 && maShortView.length > 0) {
    priceChart = asciichart.plot([closesView, maLongView, maShortView], priceCfg);
  } else if (maLongView.length > 0) {
    priceChart = asciichart.plot([closesView, maLongView], priceCfg);
  } else if (maShortView.length > 0) {
    priceChart = asciichart.plot([closesView, maShortView], priceCfg);
  } else {
    priceChart = asciichart.plot(closesView, priceCfg);
  }

  // --------- CHART VOLUME ----------
  const volCfg: asciichart.PlotOptions = {
    height: args.volHeight,
    format: (x: number) => fmt(x),
    colors: [asciichart.cyan],
  };
  const volChart = asciichart.plot(volsView, volCfg);

  // --------- RENDU ----------
  log("=== DB Candles Plot ===");
  console.log(
    [
      `PAIR: ${args.pair}`,
      `POINTS: ${closesView.length}`,
      `WINDOW: ${args.days}j`,
      `CLOSE(min→max): ${fmt(minClose)} → ${fmt(maxClose)}`,
      `TIME: ${firstTs} … ${lastTs} (epoch s)`,
      `MA(long|short): ${args.ma} | ${args.ma2}`
    ].join("  |  ")
  );

  console.log("\nClose (blue), MA long (green), MA court (red):");
  console.log(priceChart);

  console.log("\nVolume:");
  console.log(volChart);
}

main().catch((e) => {
  err(e instanceof Error ? e.stack || e.message : e);
  process.exitCode = 1;
}).finally(() => {
  closeLogger();
});
