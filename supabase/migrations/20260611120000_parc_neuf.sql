-- Parc locatif séparé : le neuf du parc est un compteur dédié, distinct du
-- stock_actuel (qui reste 100% vendable et n'est jamais touché par la location).
ALTER TABLE produits ADD COLUMN IF NOT EXISTS stock_loc_neuf INTEGER DEFAULT 0;
