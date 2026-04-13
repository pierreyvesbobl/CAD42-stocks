-- ═══════════════════════════════════════════════════════════
-- Migration: operators, families, fabrication enhancements
-- ═══════════════════════════════════════════════════════════

-- ─── Operators table ───
CREATE TABLE IF NOT EXISTS operateurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE operateurs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all on operateurs" ON operateurs FOR ALL USING (true) WITH CHECK (true);

-- Seed default operator
INSERT INTO operateurs (nom, email) VALUES ('Rafa', NULL) ON CONFLICT DO NOTHING;

-- ─── Families table ───
CREATE TABLE IF NOT EXISTS familles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE familles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all on familles" ON familles FOR ALL USING (true) WITH CHECK (true);

-- Seed existing families
INSERT INTO familles (nom) VALUES ('RTK'), ('Kit'), ('Gateway'), ('Accessoire'), ('Autre')
ON CONFLICT (nom) DO NOTHING;

-- ─── Fabrication batch tracking ───
-- Add batch_id to group movements from same fabrication/maintenance
ALTER TABLE mouvements ADD COLUMN IF NOT EXISTS batch_id UUID;
-- Add mode column to distinguish fabrication / maintenance / annulation
ALTER TABLE mouvements ADD COLUMN IF NOT EXISTS mode TEXT;

CREATE INDEX IF NOT EXISTS idx_mouvements_batch ON mouvements (batch_id);
CREATE INDEX IF NOT EXISTS idx_mouvements_mode ON mouvements (mode);

-- ─── Fabrication history table ───
CREATE TABLE IF NOT EXISTS fabrication_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id UUID REFERENCES produits(id),
  produit_nom TEXT NOT NULL,
  quantite INTEGER NOT NULL,
  mode TEXT NOT NULL DEFAULT 'fabrication', -- 'fabrication' or 'maintenance'
  operateur TEXT NOT NULL,
  batch_id UUID NOT NULL,
  cancelled BOOLEAN DEFAULT false,
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE fabrication_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all on fabrication_history" ON fabrication_history FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_fab_history_produit ON fabrication_history (produit_id);
CREATE INDEX IF NOT EXISTS idx_fab_history_batch ON fabrication_history (batch_id);
CREATE INDEX IF NOT EXISTS idx_fab_history_created ON fabrication_history (created_at DESC);
