-- Migration 20250817_0001 : création de la table candles

CREATE TABLE IF NOT EXISTS candles (
  pair   TEXT    NOT NULL,   -- ex: "XBT/EUR"
  time   INTEGER NOT NULL,   -- epoch en secondes, aligné sur 4h (UTC)
  open   REAL    NOT NULL,
  high   REAL    NOT NULL,
  low    REAL    NOT NULL,
  close  REAL    NOT NULL,
  volume REAL    NOT NULL,
  PRIMARY KEY (pair, time)
);

-- Index pour des recherches rapides sur une paire donnée par date
CREATE INDEX IF NOT EXISTS idx_candles_pair_time ON candles(pair, time);
