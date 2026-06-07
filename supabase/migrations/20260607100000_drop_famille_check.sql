-- #5 — Les familles sont gérées dans la table `familles` (CRUD dans Paramètres)
-- depuis 20260413, mais `produits.famille` gardait le CHECK figé de la v1
-- ('RTK','Kit','Gateway','Accessoire','Autre'). Toute famille créée ou renommée
-- depuis l'UI violait la contrainte : la propagation du renommage échouait en
-- silence et laissait des produits avec une famille orpheline, puis toute
-- modification de ces produits levait produits_famille_check.

ALTER TABLE produits DROP CONSTRAINT IF EXISTS produits_famille_check;

-- Nettoyage des orphelins laissés par les renommages échoués :
-- 1. re-mappe vers la famille existante quand seule la casse diffère
--    (« accessoire » → « Accessoire »)
UPDATE produits p
SET famille = f.nom
FROM familles f
WHERE p.famille IS NOT NULL
  AND lower(p.famille) = lower(f.nom)
  AND p.famille <> f.nom;

-- 2. les familles restantes inconnues de la table sont réinjectées dans
--    `familles` plutôt que perdues — l'utilisateur les renommera depuis l'UI.
INSERT INTO familles (nom)
SELECT DISTINCT p.famille
FROM produits p
WHERE p.famille IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM familles f WHERE f.nom = p.famille)
ON CONFLICT (nom) DO NOTHING;
