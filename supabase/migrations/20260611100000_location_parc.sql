-- Parc locatif : stock de location à part, suivi en 3 statuts.
-- neuf = stock_actuel existant (alimenté par la fabrication),
-- retour = stock_loc_retour, en location = stock_loc_en_location.

-- 1. Colonnes parc locatif sur produits
ALTER TABLE produits ADD COLUMN IF NOT EXISTS est_locatif BOOLEAN DEFAULT false;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS stock_loc_retour INTEGER DEFAULT 0;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS stock_loc_en_location INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_produits_locatif ON produits(est_locatif) WHERE est_locatif;

-- 2. Autoriser source='Location' dans mouvements (contrainte inline auto-nommée)
ALTER TABLE mouvements DROP CONSTRAINT IF EXISTS mouvements_source_check;
ALTER TABLE mouvements ADD CONSTRAINT mouvements_source_check
  CHECK (source IN ('Facture auto','Fabrication','Manuel','Ajustement','Location'));

-- 3. Historique des opérations de location (calqué sur fabrication_history)
CREATE TABLE IF NOT EXISTS location_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id UUID REFERENCES produits(id),
  produit_nom TEXT NOT NULL,
  quantite INTEGER NOT NULL,
  type TEXT NOT NULL,            -- 'mise' | 'retour'
  qty_neuf INTEGER DEFAULT 0,    -- portion prise au neuf (mise) — pour annulation exacte
  qty_retour INTEGER DEFAULT 0,  -- portion prise au retour (mise)
  operateur TEXT NOT NULL,
  batch_id UUID NOT NULL,
  cancelled BOOLEAN DEFAULT false,
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_location_history_created ON location_history(created_at DESC);
