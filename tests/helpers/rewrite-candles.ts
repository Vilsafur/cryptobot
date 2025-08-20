import { readFile, writeFile } from 'node:fs/promises';

// Nombre de bougies par paire
const N = 721;
const STEP = 4 * 60 * 60; // 4h en secondes
const candlesSqlPath = './src/fixtures/candles.sql';

async function main() {
  const input = await readFile(candlesSqlPath, 'utf8');
  const lines = input.split('\n').filter(Boolean);

  // Timestamp actuel (arrondi à 4h pour coller aux bougies)
  const now = Math.floor(Date.now() / 1000);
  const alignedNow = now - (now % STEP);

  // Séparer par paire
  const grouped: Record<string, string[]> = {};
  for (const line of lines) {
    const pair = line.match(/VALUES\('([^']+)'/)?.[1];
    if (!pair) continue;
    if (!grouped[pair]) grouped[pair] = [];
    grouped[pair].push(line);
  }

  const output: string[] = [];

  for (const [pair, pairLines] of Object.entries(grouped)) {
    if (pairLines.length !== N) {
      console.warn(`⚠️ ${pair} a ${pairLines.length} lignes (attendu ${N})`);
    }

    pairLines.forEach((line, i) => {
      const ts = alignedNow - (N - 1 - i) * STEP; // index 0 = ancien, index 720 = now
      // Remplace la 2e valeur (timestamp)
      const newLine = line.replace(
        /(VALUES\('[^']+',)(\d+)/,
        `$1${ts}`
      );
      output.push(newLine);
    });
  }

  await writeFile(candlesSqlPath, output.join('\n'));
  console.log('✅ Fichier candles_fixed.sql généré');
}

main().catch(console.error);
