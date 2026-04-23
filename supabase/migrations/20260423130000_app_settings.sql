-- Config applicative key/value (ex: clé API Gemini).
-- Lecture/écriture réservées au service_role (jamais exposées au client anon).

CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
-- Aucune policy → anon bloqué. service_role bypass RLS par défaut.
