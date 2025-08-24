// tests/strategy/swing.spec.ts
/** biome-ignore-all lint/suspicious/noExplicitAny: test file */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ------- helpers de mock & utils -------
type Mocked = {
  getDB: () => any;
  getOpenTrades: (pair: string) => any[];
  openTrade: (t: any) => number;
  closeTrade: (id: number, p: { exit_price: number }) => any;
  log: (...a: any[]) => void;
  warn: (...a: any[]) => void;
  debug: (...a: any[]) => void;
};

function makeCandles(closes: number[], t0 = 0, stepSec = 60): any[] {
  return closes.map((c, i) => ({
    time: t0 + i * stepSec,
    open: c,
    high: c,
    low: c,
    close: c,
    volume: 0,
  }));
}

async function loadSwingWithMocks(
  opts: {
    pairSettings?: Partial<{
      pair: string;
      max_invest_fiat: number;
      max_per_tx_fiat: number;
      take_profit_pct: number;
      stop_loss_pct: number;
    }>;
    openTrades?: any[];
    closeTradeImpl?: (id: number, p: { exit_price: number }) => any;
  } = {},
) {
  vi.resetModules();

  const pairSettings = {
    pair: "ETH/EUR",
    max_invest_fiat: 100,
    max_per_tx_fiat: 20,
    take_profit_pct: 0.06,
    stop_loss_pct: 0.03,
    ...(opts.pairSettings ?? {}),
  };

  const openTradesArr = opts.openTrades ?? [];

  // mock logger (silence dans les tests)
  await vi.doMock("../../src/tools/logger", () => ({
    log: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }));

  // mock getDB → prepare().get() renvoie nos settings quand WHERE pair = ?
  await vi.doMock("../../src/db/storage", () => {
    return {
      getDB: () => ({
        prepare: () => ({
          get: (_pair: string) => pairSettings,
        }),
      }),
    };
  });

  // mock trades
  const openTradeMock = vi.fn().mockReturnValue(42);
  const getOpenTradesMock = vi
    .fn()
    .mockImplementation((pair: string) =>
      openTradesArr.filter((t) => t.pair === pair && t.status === "OPEN"),
    );
  const closeTradeMock = vi.fn().mockImplementation(
    opts.closeTradeImpl ??
      ((_id: number, p: { exit_price: number }) => ({
        pnl: 123.45,
        ...p,
      })),
  );

  await vi.doMock("../../src/db/trades", () => ({
    openTrade: openTradeMock,
    getOpenTrades: getOpenTradesMock,
    closeTrade: closeTradeMock,
  }));

  const swing = await import("../../src/strategy/swing.ts");

  const logger = await import("../../src/tools/logger");
  const trades = await import("../../src/db/trades");

  const mocked: Mocked = {
    getDB: (await import("../../src/db/storage")).getDB as any,
    getOpenTrades: (trades as any).getOpenTrades,
    openTrade: (trades as any).openTrade,
    closeTrade: (trades as any).closeTrade,
    log: (logger as any).log,
    warn: (logger as any).warn,
    debug: (logger as any).debug,
  };

  return { swing, mocked };
}

// --------- tests ----------
describe("swing.runSwingForPairOnce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-02T03:04:05.000Z"));
  });

  it("HOLD/NOT_ENOUGH_HISTORY quand bougies < need", async () => {
    const { swing, mocked } = await loadSwingWithMocks();
    const params = {
      maShort: 2,
      maLong: 3,
      lookback: 50,
      mode: "simulation" as const,
    };
    const candles = makeCandles([10, 10, 10]); // need = 4

    const res = swing.runSwingForPairOnce("ETH/EUR", candles, params);
    expect(res).toEqual({ kind: "HOLD", reason: "NOT_ENOUGH_HISTORY" });
    expect((mocked.warn as any).mock.calls.length).toBe(1);
  });

  it("HOLD/NO_SIGNAL quand pas de croisement haussier et pas de trade ouvert", async () => {
    const { swing, mocked } = await loadSwingWithMocks();
    const params = {
      maShort: 2,
      maLong: 3,
      lookback: 50,
      mode: "simulation" as const,
    };
    // Série plate => pas de cross up confirmé
    const candles = makeCandles([10, 10, 10, 10]);

    const res = swing.runSwingForPairOnce("ETH/EUR", candles, params);
    expect(res).toEqual({ kind: "HOLD", reason: "NO_SIGNAL" });
    expect((mocked.debug as any).mock.calls.length).toBe(1);
  });

  it("BUY (simulation) quand croisement haussier + budget dispo", async () => {
    const { swing } = await loadSwingWithMocks({
      // aucune position ouverte => budget plein
      openTrades: [],
      pairSettings: {
        max_invest_fiat: 100,
        max_per_tx_fiat: 20,
        take_profit_pct: 0.06,
        stop_loss_pct: 0.03,
      },
    });
    const params = {
      maShort: 2,
      maLong: 3,
      lookback: 50,
      mode: "simulation" as const,
    };
    // Cross up confirmé sur la dernière bougie :
    // i=0..3 : 10,10,10,20  → SMA2prev=10, SMA3prev=10  |  SMA2cur=15 > SMA3cur=13.33
    const candles = makeCandles([10, 10, 10, 20]);

    const res = swing.runSwingForPairOnce("ETH/EUR", candles, params);

    expect(res.kind).toBe("BUY");
    if (res.kind === "BUY") {
      expect(res.price).toBe(20);
      // qty = 20€ / 20 = 1
      expect(res.qty).toBeCloseTo(1, 10);
      // SL = 20 * (1 - 0.03) = 19.4
      expect(res.sl).toBeCloseTo(19.4, 10);
      // TP = 20 * (1 + 0.06) = 21.2
      expect(res.tp).toBeCloseTo(21.2, 10);
    }
  });

  it("HOLD/NO_BUDGET quand le budget restant est 0", async () => {
    const { swing } = await loadSwingWithMocks({
      // simule un trade ouvert qui consomme tout le plafond
      openTrades: [{ pair: "ETH/EUR", status: "OPEN", invested: 100 }],
      pairSettings: {
        max_invest_fiat: 100,
        max_per_tx_fiat: 20,
      },
    });
    const params = {
      maShort: 2,
      maLong: 3,
      lookback: 50,
      mode: "simulation" as const,
    };
    const candles = makeCandles([10, 10, 10, 20]); // cross up confirmé

    const res = swing.runSwingForPairOnce("ETH/EUR", candles, params);
    expect(res).toEqual({ kind: "HOLD", reason: "NO_BUDGET" });
  });

  it("SELL (simulation) quand TP atteint (après un BUY précédent)", async () => {
    const { swing } = await loadSwingWithMocks({
      openTrades: [], // computeOrderFiatBudget ne voit rien d’ouvert
      pairSettings: {
        max_invest_fiat: 100,
        max_per_tx_fiat: 20,
        take_profit_pct: 0.06,
        stop_loss_pct: 0.03,
      },
    });
    const params = {
      maShort: 2,
      maLong: 3,
      lookback: 50,
      mode: "simulation" as const,
    };

    // 1) BUY
    const candlesBuy = makeCandles([10, 10, 10, 20]);
    const buy = swing.runSwingForPairOnce("ETH/EUR", candlesBuy, params);
    expect(buy.kind).toBe("BUY");
    // qty = 1, entry = 20, tp = 21.2

    // 2) SELL: on monte à 25 => TP atteint
    const candlesSell = makeCandles([10, 10, 10, 25]);
    const sell = swing.runSwingForPairOnce("ETH/EUR", candlesSell, params);

    expect(sell.kind).toBe("SELL");
    if (sell.kind !== "SELL") return;
    expect(sell.reason).toBe("TP");
    // pnl = (25 - 20) * 1 = 5
    expect(sell.pnl).toBeCloseTo(5, 10);
  });

  it("SELL (mode réel) sur croisement baissier confirmé (closeTrade appelé)", async () => {
    const { swing, mocked } = await loadSwingWithMocks({
      // un trade ouvert en base
      openTrades: [
        {
          id: 7,
          pair: "ETH/EUR",
          status: "OPEN",
          entry_price: 20,
          amount: 2,
          invested: 40,
          stop_loss: null,
          take_profit: null,
        },
      ],
      closeTradeImpl: (id: number, p: { exit_price: number }) => ({
        id,
        pnl: (p.exit_price - 20) * 2,
      }),
    });
    const params = {
      maShort: 2,
      maLong: 3,
      lookback: 50,
      mode: "real" as const,
    };

    // Croisement baissier : 10,10,10,0
    // prev: SMA2=10 >= SMA3=10 ; cur: SMA2=5 < SMA3=6.66
    const candles = makeCandles([10, 10, 10, 0]);

    const res = swing.runSwingForPairOnce("ETH/EUR", candles, params);
    expect(res.kind).toBe("SELL");
    if (res.kind !== "SELL") return;
    expect(res.reason).toBe("CROSS");

    // closeTrade appelé avec le bon id et un exit_price à 0
    expect((mocked.closeTrade as any).mock.calls[0][0]).toBe(7);
    expect(
      ((mocked.closeTrade as any).mock.calls[0][1] as any).exit_price,
    ).toBe(0);
  });
});
