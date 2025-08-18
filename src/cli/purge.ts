// src/cli/purge.ts
import Database from "better-sqlite3";
import { config, FOUR_HOURS_SECS, nowSecs } from "../config.js";
import { log, warn, err, closeLogger } from "../tools/logger.js";
import { getPairList } from "../db/pairs.js";

const assertCandlesTableExists = (db: Database.Database) => {
	const row = db
		.prepare(
			`SELECT name FROM sqlite_master WHERE type='table' AND name='candles'`,
		)
		.get() as { name?: string } | undefined;
	if (!row?.name) {
		throw new Error(
			`[purge] Table "candles" introuvable. Exécute d'abord les migrations (ex: npm run migrate).`,
		);
	}
};

const applyRetentionForPair = (db: Database.Database, pair: string) => {
	const now = nowSecs();
	const fullCut = now - config.retention.fullDays * 24 * 3600;
	const halfCut = now - config.retention.halfDays * 24 * 3600;
	const sixthCut = now - config.retention.sixthDays * 24 * 3600;

	const delOlderThanSixth = db.prepare(
		`DELETE FROM candles WHERE pair = ? AND time < ?`,
	);

	const downsampleSixth = db.prepare(
		`DELETE FROM candles
     WHERE pair = ?
       AND time >= ?
       AND time < ?
       AND ((time / ${FOUR_HOURS_SECS}) % 6) != 0`,
	);

	const downsampleHalf = db.prepare(
		`DELETE FROM candles
     WHERE pair = ?
       AND time >= ?
       AND time < ?
       AND ((time / ${FOUR_HOURS_SECS}) % 2) != 0`,
	);

	const tx = db.transaction(() => {
		let deleted = 0;
		deleted += delOlderThanSixth.run(pair, sixthCut).changes ?? 0;
		deleted += downsampleSixth.run(pair, halfCut, sixthCut).changes ?? 0;
		deleted += downsampleHalf.run(pair, fullCut, halfCut).changes ?? 0;
		return deleted;
	});

	const removed = tx();
	return { removed, fullCut, halfCut, sixthCut };
};

const main = async () => {
	const pairs = getPairList();
	log("=== Purge des données (rétention) ===");
	log(`DB: ${config.dbPath}`);
	log(
		`Rétention (jours): full=${config.retention.fullDays} | half=${config.retention.halfDays} | sixth=${config.retention.sixthDays}`,
	);
	log(`Paires: ${pairs.join(", ")}`);

	const db = new Database(config.dbPath);
	db.pragma("journal_mode = WAL");

	// ⚠️ Erreur directe si la table n’existe pas
	assertCandlesTableExists(db);

	for (const pair of pairs) {
		try {
			const { removed, fullCut, halfCut, sixthCut } = applyRetentionForPair(
				db,
				pair,
			);
			log(
				`[purge] ${pair}: deleted=${removed} | windows: (0→${fullCut}) keep all, (${fullCut}→${halfCut}) keep 1/2, (${halfCut}→${sixthCut}) keep 1/6, (<${sixthCut}) purge`,
			);
		} catch (e: any) {
			warn(`[purge] ${pair}: échec`, e?.message ?? e);
		}
	}

	db.close();
	closeLogger();
};

main().catch((e) => {
	err("Erreur inattendue:", e instanceof Error ? e.stack || e.message : e);
	process.exitCode = 1;
	closeLogger();
});
