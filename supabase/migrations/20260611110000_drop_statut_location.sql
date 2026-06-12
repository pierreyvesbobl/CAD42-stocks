-- Le statut 'Location' est remplacé par le flag est_locatif (un produit fini
-- peut être locatif sans changer de statut). Aucun produit ne l'utilise.
ALTER TABLE produits DROP CONSTRAINT IF EXISTS produits_statut_check;
ALTER TABLE produits ADD CONSTRAINT produits_statut_check
  CHECK (statut IN ('Composant', 'Produit fini', 'Obsolète'));
