-- ═══════════════════════════════════════════════════════════
-- Migration: component substitutes
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS substituts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  composant_id UUID NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  substitut_id UUID NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  priorite INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),

  -- A component cannot substitute itself
  CONSTRAINT no_self_substitut CHECK (composant_id != substitut_id),
  -- Unique pair
  CONSTRAINT unique_substitut UNIQUE (composant_id, substitut_id)
);

ALTER TABLE substituts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all on substituts" ON substituts FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_substituts_composant ON substituts (composant_id, priorite);
CREATE INDEX idx_substituts_substitut ON substituts (substitut_id);
