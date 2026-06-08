-- #20 — Permet d'organiser une nomenclature en sous-groupes nommés
-- (« Boîtier externe », « Batterie », « Structure mécanique »…). Section libre
-- par ligne : NULL = lignes hors section, affichées sous « Sans section ».

ALTER TABLE nomenclatures ADD COLUMN IF NOT EXISTS section TEXT;

-- resolve_bom remonte la section pour que le récap de fabrication puisse
-- regrouper. Les composants issus de sous-assemblages imbriqués héritent du
-- nom du sous-assemblage comme section (plus parlant qu'une section vide).
DROP FUNCTION IF EXISTS resolve_bom(UUID, INTEGER);
CREATE OR REPLACE FUNCTION resolve_bom(p_produit_id UUID, p_quantite INTEGER DEFAULT 1)
RETURNS TABLE (
  composant_id UUID, reference TEXT, nom TEXT, quantite_necessaire NUMERIC,
  stock_actuel INTEGER, stock_apres INTEGER,
  is_deficit BOOLEAN, is_alerte BOOLEAN, seuil_alerte INTEGER, section TEXT
) LANGUAGE SQL STABLE AS $$
  WITH RECURSIVE bom AS (
    SELECT n.composant_id, n.quantite * p_quantite AS qty, 1 AS niveau,
           ARRAY[n.produit_assemble_id] AS chemin,
           n.section AS section
    FROM nomenclatures n WHERE n.produit_assemble_id = p_produit_id
    UNION ALL
    -- Pour les niveaux imbriqués, la section devient le nom du sous-assemblage
    -- parent (le produit que cette ligne décompose).
    SELECT n.composant_id, n.quantite * b.qty, b.niveau + 1,
           b.chemin || n.produit_assemble_id,
           COALESCE(parent.nom, n.section)
    FROM nomenclatures n
    JOIN bom b ON n.produit_assemble_id = b.composant_id
    JOIN produits p ON p.id = b.composant_id
    JOIN produits parent ON parent.id = n.produit_assemble_id
    WHERE p.statut <> 'Composant'
      AND NOT (n.produit_assemble_id = ANY(b.chemin)) AND b.niveau < 10
  )
  SELECT b.composant_id, p.reference, p.nom, SUM(b.qty),
    p.stock_actuel, p.stock_actuel - CAST(SUM(b.qty) AS INTEGER),
    (p.stock_actuel - SUM(b.qty)) < 0, (p.stock_actuel - SUM(b.qty)) <= p.seuil_alerte, p.seuil_alerte,
    MIN(b.section) AS section
  FROM bom b JOIN produits p ON p.id = b.composant_id
  WHERE p.statut = 'Composant'
  GROUP BY b.composant_id, p.reference, p.nom, p.stock_actuel, p.seuil_alerte;
$$;
