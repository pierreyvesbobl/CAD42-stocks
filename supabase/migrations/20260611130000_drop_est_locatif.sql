-- Le flag est_locatif est abandonné : tous les produits finis sont
-- éligibles à la location. Un produit « entre » dans le parc dès qu'on lui
-- ajoute des unités (stock_loc_*). Le parc est filtré sur total > 0.
DROP INDEX IF EXISTS idx_produits_locatif;
ALTER TABLE produits DROP COLUMN IF EXISTS est_locatif;
