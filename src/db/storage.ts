// src/db/storage.ts
import Database from "better-sqlite3";
import { config } from "../config.js";
import { debug } from "../tools/logger.js";

let db: Database.Database | null = null;

const ensureTableExists = (d: Database.Database, table_name: string) => {
	const row = d
		.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
		.get(table_name) as { name?: string } | undefined;
	if (!row?.name) {
		throw new Error(
			`[storage] Table "candles" introuvable. Exécute d'abord les migrations (ex: npm run migrate).`,
		);
	}
};

export const getDB = (): Database.Database => {
	if (!db) {
		db = new Database(config.dbPath);
		db.pragma("journal_mode = WAL"); // robustesse / perfs
		ensureTableExists(db, "candles");
		ensureTableExists(db, "pairs");
		debug('[storage] DB ouverte et table "candles" détectée');
	}
	return db;
};

export const closeDB = () => {
	if (db) {
		db.close();
		db = null;
	}
};
