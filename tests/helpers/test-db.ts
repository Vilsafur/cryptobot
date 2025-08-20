// tests/helpers/test-db.ts
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import {
  closeDB,
  type DB,
  getDB,
  loadFixtures,
  migrate,
} from "../../src/db/storage";
import "./test-config";

let db: DB;

export function useTestDb() {
  beforeAll(async () => {
    db = getDB(false); // Utilisation d'une base en mémoire pour les tests
    await migrate();
    await loadFixtures();
  });

  // Snapshot après migrations + fixtures
  beforeEach(() => {
    db.exec("SAVEPOINT test_case");
  });

  afterEach(() => {
    // Retour à l’état fixtures/migrations, quel que soit le test
    db.exec("ROLLBACK TO test_case");
    db.exec("RELEASE test_case");
  });

  afterAll(() => {
    closeDB();
    db.close();
  });
}
