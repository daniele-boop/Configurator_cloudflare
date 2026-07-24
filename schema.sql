-- schema.sql — struttura del database D1 per le configurazioni salvate.
--
-- Il numero progressivo (CFG-0001, CFG-0002, …) deriva dalla chiave primaria
-- AUTOINCREMENT: è il database a garantirne l'unicità, quindi due salvataggi
-- simultanei non possono mai ricevere lo stesso numero.

CREATE TABLE IF NOT EXISTS configs (
  n          INTEGER PRIMARY KEY AUTOINCREMENT,
  serial     TEXT UNIQUE,
  created_at TEXT NOT NULL,
  data       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_configs_serial ON configs(serial);
