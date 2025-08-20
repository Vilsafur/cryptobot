import { describe, expect, it } from "vitest";
import { getDB } from "../src/db/storage.js";
import { useTestDb } from "./helpers/test-db.js";

useTestDb();

describe("Pairs repository", () => {
  it("liste les pairs de la fixture", () => {
    const rows = getDB().prepare("SELECT pair FROM pairs ORDER BY pair").all();
    expect(rows).toEqual([{ pair: "ETH/EUR" }, { pair: "XBT/EUR" }]);
  });

  it("peut insérer sans polluer les autres tests", () => {
    getDB()
      .prepare(
        "INSERT INTO pairs (pair, max_invest_fiat, max_per_tx_fiat, take_profit_pct, stop_loss_pct, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "SOL/EUR",
        "10",
        "5",
        "0.05",
        "0.03",
        'CAST(strftime("%s","now") AS INTEGER)',
        'CAST(strftime("%s","now") AS INTEGER)',
      );

    const count = getDB().prepare("SELECT COUNT(*) AS n FROM pairs").get() as {
      n: number;
    };
    expect(count.n).toBe(3);
  });

  it("repart sur fixtures (rollback)", () => {
    const count = getDB().prepare("SELECT COUNT(*) AS n FROM pairs").get() as {
      n: number;
    };
    // ↳ revien à 2 grâce au rollback du test précédent
    expect(count.n).toBe(2);
  });
});
