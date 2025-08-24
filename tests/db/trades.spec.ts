import { describe, expect, it } from "vitest";
import {
  closeTrade,
  deleteTrade,
  getOpenTrades,
  getTradeById,
  listTrades,
  openTrade,
} from "../../src/db/trades";
import { useTestDb } from "../helpers/test-db";

useTestDb();

describe("Trades DB", () => {
  it("Ouvre un trade", () => {
    const nbInitialTrades = listTrades().length;
    openTrade({
      amount: 0.0123,
      entry_price: 0.124,
      invested: 20,
      pair: "ETH/EUR",
      side: "BUY",
    });
    const nbFinalTrades = listTrades().length;
    expect(nbFinalTrades).toEqual(nbInitialTrades + 1);
  });

  it("Retourne le trade demandé", () => {
    const trade = getTradeById(1);
    expect(trade?.entry_price).toEqual(1600.82);
  });

  it("Retourne les trades", () => {
    const nbTrades = listTrades().length;
    expect(nbTrades).toEqual(30);
  });
  it("Retourne les trades ouverts", () => {
    const nbTrades = getOpenTrades().length;
    expect(nbTrades).toEqual(0);
  });
  it("Retourne les trades fermés", () => {
    const openTradeId = openTrade({
      amount: 0.0123,
      entry_price: 0.124,
      invested: 20,
      pair: "ETH/EUR",
      side: "BUY",
    });
    const trade = closeTrade(openTradeId, {
      exit_price: 0.3254,
    });
    expect(trade.amount).toEqual(0.0123);
    expect(trade.exit_price).toEqual(0.3254);
    expect(trade.pnl).toEqual(0.0024772200000000005);
  });
  it("Supprime un trade", () => {
    const nbInitialTrades = listTrades().length;
    deleteTrade(1);
    const nbFinalTrades = listTrades().length;
    expect(nbFinalTrades).toEqual(nbInitialTrades - 1);
  });
});
