// scripts/rewrite-trades.ts
import { readFile, writeFile } from "node:fs/promises";

const STEP = 4 * 60 * 60;               // 4h en secondes
const tradesSqlPath = "./src/fixtures/trades.sql";

// Aligne "now" sur un multiple de STEP (utile pour coller aux bougies 4h)
function alignNowToStep(stepSec: number): number {
  const now = Math.floor(Date.now() / 1000);
  return now - (now % stepSec);
}

// Format epoch -> ISO (compatible SQLite)
function tsToISO(tsSec: number): string {
  return new Date(tsSec * 1000).toISOString();
}

// Découpe sûre des valeurs à l’intérieur de VALUES(...), en respectant les quotes
function splitValuesRespectQuotes(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'") {
      inQuote = !inQuote;
      cur += ch;
    } else if (ch === "," && !inQuote) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function joinValues(values: string[]): string {
  return values.join(", ");
}

async function main() {
  const raw = await readFile(tradesSqlPath, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);

  const alignedNow = alignNowToStep(STEP);
  const N = lines.length;
  const outLines: string[] = [];

  for (let i = 0; i < N; i++) {
    const line = lines[i];

    // closed_at du dernier trade = now aligné ; on recule STEP par trade
    const closedTs = alignedNow - (N - 1 - i) * STEP;
    const openedTs = closedTs - STEP;

    // Capture le bloc VALUES(...)
    const m = line.match(/VALUES\s*\((.*)\)\s*;?$/i);
    if (!m) {
      // Ligne non conforme -> recopiée telle quelle
      outLines.push(line);
      continue;
    }

    const inside = m[1];
    const values = splitValuesRespectQuotes(inside);

    // Indices (0-based) attendus selon ton schéma :
    // 0:pair 1:side 2:entry 3:exit 4:amount 5:invested 6:sl 7:tp 8:status 9:opened_at 10:closed_at 11:pnl
    if (values.length < 11) {
      // Structure inattendue -> recopiée telle quelle
      outLines.push(line);
      continue;
    }

    values[9]  = `'${tsToISO(openedTs)}'`; // opened_at (10e champ)
    values[10] = `'${tsToISO(closedTs)}'`; // closed_at (11e champ)

    const newLine = line.replace(
      /VALUES\s*\((.*)\)\s*;?$/i,
      `VALUES (${joinValues(values)});`
    );

    outLines.push(newLine);
  }

  await writeFile(tradesSqlPath, outLines.join("\n") + "\n", "utf8");
  console.log(`✅ ${tradesSqlPath} généré (${N} trades traités) à partir de ${tradesSqlPath}.`);
}

main().catch((err) => {
  console.error("❌ rewrite-trades failed:", err);
  process.exit(1);
});
