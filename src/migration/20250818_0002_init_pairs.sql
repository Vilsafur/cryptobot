-- Migration 20250818_0002 : création de la table pairs
-- Remplace la config des paires dans .env par une table dédiée.

CREATE TABLE IF NOT EXISTS pairs (
  pair                TEXT    NOT NULL,  -- ex: "XBT/EUR"
  max_invest_fiat     REAL    NOT NULL,  -- montant max à investir (en devise de base)
  max_per_tx_fiat     REAL    NOT NULL,  -- montant max par transaction (en devise de base)
  take_profit_pct     REAL    NOT NULL,  -- take profit en pourcentage décimal (ex: 0.05 = 5%)
  stop_loss_pct       REAL    NOT NULL,  -- stop loss en pourcentage décimal (ex: 0.03 = 3%)
  created_at          INTEGER NOT NULL,  -- epoch (s)
  updated_at          INTEGER NOT NULL,  -- epoch (s)
  PRIMARY KEY (pair),

  -- Garde-fous
  CHECK (length(pair) > 0),
  CHECK (max_invest_fiat > 0),
  CHECK (max_per_tx_fiat > 0),
  CHECK (max_per_tx_fiat <= max_invest_fiat),
  CHECK (take_profit_pct >= 0 AND take_profit_pct <= 1),
  CHECK (stop_loss_pct  >= 0 AND stop_loss_pct  <= 1)
);

-- Pour faciliter les recherches (optionnel, la PK couvre déjà pair)
CREATE INDEX IF NOT EXISTS idx_pairs_pair ON pairs(pair);

-- Trigger: mise à jour automatique du champ updated_at
CREATE TRIGGER IF NOT EXISTS trg_pairs_updated_at
AFTER UPDATE ON pairs
FOR EACH ROW
BEGIN
  UPDATE pairs
  SET updated_at = CAST(strftime('%s','now') AS INTEGER)
  WHERE pair = OLD.pair;
END;
