// src/cli/migrate.ts

import fs from "node:fs";
import { basename, join } from "node:path";
import { getDB, migrate } from "../db/storage";

type MigrationFile = {
  id: string; // ex: "20250817_0001"
  name: string; // ex: "init"
  filename: string; // ex: "20250817_0001_init.sql"
  sql: string;
};

const getMigrationsDir = (): string => {
  // Dossier des migrations TypeScript : src/migration/
  // On résout par rapport à ce fichier CLI
  return join(process.cwd(), "src", "migration");
};

const readSqlMigrations = (dir: string): MigrationFile[] => {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"));

  return entries.map((filename) => {
    const base = basename(filename, ".sql"); // ex: 20250817_0001_init
    // Id = tout jusqu’au 2e segment (avant le 2e underscore) si présent
    // Conventions :
    //   20250817_0001_init.sql → id: 20250817_0001, name: init
    //   0001_init.sql          → id: 0001,           name: init
    //   init.sql               → id: init,          name: init
    const parts = base.split("_");
    let id = base;
    let name = base;
    if (parts.length >= 2) {
      id = parts.slice(0, 2).join("_");
      name = parts.slice(2).join("_") || base;
    }
    const sql = fs.readFileSync(join(dir, filename), "utf8");
    return { id, name, filename, sql };
  });
};

const getAppliedMigrations = (): Set<string> => {
  const db = getDB(false);
  const rows = db
    .prepare(`SELECT id FROM schema_migrations ORDER BY id ASC`)
    .all() as { id: string }[];
  return new Set(rows.map((r) => r.id));
};

export const cmdUp = (migrations: MigrationFile[]) => {
  const applied = getAppliedMigrations();
  const pending = migrations.filter((m) => !applied.has(m.id));

  if (pending.length === 0) {
    console.log("✅ Aucune migration en attente. Base à jour.");
    return;
  }

  console.log(`🚀 Application de ${pending.length} migration(s).`);
  migrate();
  console.log("✅ Migrations appliquées avec succès.");
};

const cmdStatus = (migrations: MigrationFile[]) => {
  const applied = getAppliedMigrations();

  const all = migrations.map((m) => ({
    id: m.id,
    name: m.name,
    filename: m.filename,
    applied: applied.has(m.id),
  }));

  if (all.length === 0) {
    console.log("ℹ️  Aucune migration trouvée dans src/migration/.");
    return;
  }

  console.log("📋 État des migrations :");
  for (const m of all) {
    console.log(`${m.applied ? "✓" : "·"} ${m.id} ${m.name} (${m.filename})`);
  }
};

const main = () => {
  const cmd = process.argv[2] ?? "up";

  const migrationsDir = getMigrationsDir();
  const migrations = readSqlMigrations(migrationsDir);

  switch (cmd) {
    case "up":
      cmdUp(migrations);
      break;
    case "status":
      cmdStatus(migrations);
      break;
    default:
      console.error(
        `Commande inconnue: ${cmd}\nUtilisation: migrate.ts [up|status]`,
      );
      process.exit(1);
  }
};

main();
