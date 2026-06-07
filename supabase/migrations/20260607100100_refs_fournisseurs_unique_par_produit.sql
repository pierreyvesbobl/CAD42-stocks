-- #8 — Une même référence fournisseur peut couvrir plusieurs composants :
-- ex. un assortiment de passe-câbles acheté sous une seule réf, mais éclaté
-- par diamètre dans l'inventaire. L'unicité globale devient une unicité par
-- produit (pas de doublon de réf sur une même fiche).

ALTER TABLE references_fournisseurs
  DROP CONSTRAINT IF EXISTS references_fournisseurs_reference_key;

ALTER TABLE references_fournisseurs
  ADD CONSTRAINT references_fournisseurs_produit_ref_key UNIQUE (produit_id, reference);

-- L'index de lookup par référence (matching factures) reste en place :
-- idx_ref_fournisseurs_reference.
