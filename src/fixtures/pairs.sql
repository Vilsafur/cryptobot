INSERT INTO pairs (pair, max_invest_fiat, max_per_tx_fiat, take_profit_pct, stop_loss_pct, created_at, updated_at)
VALUES
  ('XBT/EUR', 10, 5, 0.05, 0.03, CAST(strftime('%s','now') AS INTEGER), CAST(strftime('%s','now') AS INTEGER)),
  ('ETH/EUR', 10, 5, 0.05, 0.03, CAST(strftime('%s','now') AS INTEGER), CAST(strftime('%s','now') AS INTEGER))
ON CONFLICT DO NOTHING;  -- Ignore si déjà insérées
