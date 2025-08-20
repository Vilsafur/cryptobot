// src/db/storage.ts
import Database from "better-sqlite3";
import { config, nowSecs } from "../config.js";
import { debug } from "../tools/logger.js";
import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

export type DB = Database.Database;

type MigrationFile = {
	id: string; // ex: "20250817_0001"
	name: string; // ex: "init"
	filename: string; // ex: "20250817_0001_init.sql"
	sql: string;
};

let db: DB | null = null;

const ensureTableExists = (d: Database.Database, table_name: string) => {
	const row = d
		.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
		.get(table_name) as { name?: string } | undefined;
	if (!row?.name) {
		throw new Error(
			`[storage] Table "${table_name}" introuvable. Exécute d'abord les migrations (ex: npm run migrate).`,
		);
	}
};

export const getDB = (withCheckDatabase: boolean = true): DB => {
	if (!db) {
		db = new Database(config.dbPath);
		db.pragma("journal_mode = WAL"); // robustesse / perfs
		if (withCheckDatabase) {
			ensureTableExists(db, "candles");
			ensureTableExists(db, "pairs");
		}
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

export async function runSqlFiles(dir: string, insertInMigrationsTable = false) {
	const db = getDB();
  const files = (await readdir(dir))
    .filter(f => f.endsWith('.sql'))
    // Assure l'ordre des migrations : 001_, 002_, ...
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const f of files) {
    const sql = await readFile(join(dir, f), 'utf8');
		if (insertInMigrationsTable) {
			const base = basename(f, ".sql");
			const parts = base.split("_");
			let id = base;
			let name = base;
			if (parts.length >= 2) {
				id = parts.slice(0, 2).join("_");
				name = parts.slice(2).join("_") || base;
			}
			const migrationFile : MigrationFile = {
				id,
				name,
				filename: f,
				sql,
			}
			const tx = db.transaction(() => {
				db.exec(migrationFile.sql);
				db.prepare(
					`INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)`,
				).run(migrationFile.id, migrationFile.name, nowSecs());
			});
			tx();
		}
    db.exec(sql);
  }
}

export async function migrate() {
  await runSqlFiles(join(process.cwd(), 'src', 'migration'), true);
}

export async function loadFixtures() {
  const fixturesDir = join(process.cwd(), 'src', 'fixtures');
  // Si le dossier n’existe pas, on ignore simplement
  try {
    await runSqlFiles(fixturesDir);
  } catch { /* no-op */ }
}
