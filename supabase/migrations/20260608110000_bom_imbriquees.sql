-- BOM imbriquées : un produit fini peut être référencé comme composant dans la
-- nomenclature d'un autre produit fini (« même kit présenté sous une autre forme »).
--
-- La résolution récursive existait déjà ; cette migration apporte :
--   1. resolve_bom paramétré (p_stock_aware) avec décrément hybride « make-or-take »
--   2. un trigger anti-cycle sur nomenclatures (en plus du garde-fou UI)
--   3. un helper pour exclure les candidats cycliques côté sélecteur UI

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. resolve_bom v2 — explosion (doc) OU plan de fabrication stock-aware (hybride)
--
-- p_stock_aware = false (défaut, rétro-compatible) :
--   explosion complète jusqu'aux feuilles « Composant ». Comportement inchangé,
--   utilisé pour la documentation (fiche produit / catalogue).
--
-- p_stock_aware = true :
--   décision « make-or-take » par occurrence de sous-ensemble :
--     - stock du sous-ensemble >= besoin  -> on consomme son stock (kind=sous_ensemble)
--     - sinon                              -> on éclate vers ses composants (récursif)
--   Un produit fini référencé SANS BOM est consommé tel quel (déficit si pas de
--   stock) plutôt que d'être silencieusement ignoré.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS resolve_bom(UUID, INTEGER);
CREATE OR REPLACE FUNCTION resolve_bom(
  p_produit_id UUID, p_quantite INTEGER DEFAULT 1, p_stock_aware BOOLEAN DEFAULT false
)
RETURNS TABLE (
  composant_id UUID, reference TEXT, nom TEXT, quantite_necessaire NUMERIC,
  stock_actuel INTEGER, stock_apres INTEGER,
  is_deficit BOOLEAN, is_alerte BOOLEAN, seuil_alerte INTEGER, section TEXT,
  statut TEXT, kind TEXT
) LANGUAGE SQL STABLE AS $$
  WITH RECURSIVE bom AS (
    SELECT n.composant_id AS node, n.quantite * p_quantite AS qty, 1 AS niveau,
           ARRAY[n.produit_assemble_id] AS chemin, n.section AS section
    FROM nomenclatures n WHERE n.produit_assemble_id = p_produit_id
    UNION ALL
    -- Pour les niveaux imbriqués, la section devient le nom du sous-assemblage
    -- parent (le produit que cette ligne décompose).
    SELECT n.composant_id, n.quantite * b.qty, b.niveau + 1,
           b.chemin || b.node, COALESCE(parent.nom, n.section)
    FROM bom b
    JOIN produits pnode ON pnode.id = b.node
    JOIN nomenclatures n ON n.produit_assemble_id = b.node
    JOIN produits parent ON parent.id = b.node
    WHERE pnode.statut NOT IN ('Composant', 'Obsolète')             -- nœud non-feuille
      -- explosion : toujours en mode doc ; seulement si stock insuffisant en mode fab
      AND (NOT p_stock_aware OR pnode.stock_actuel < b.qty)
      AND NOT (b.node = ANY(b.chemin)) AND b.niveau < 10            -- garde anti-boucle / profondeur
  )
  SELECT b.node, p.reference, p.nom, SUM(b.qty),
         p.stock_actuel, p.stock_actuel - CAST(SUM(b.qty) AS INTEGER),
         (p.stock_actuel - SUM(b.qty)) < 0,
         (p.stock_actuel - SUM(b.qty)) <= p.seuil_alerte, p.seuil_alerte,
         MIN(b.section) AS section,
         p.statut,
         CASE WHEN p.statut IN ('Composant', 'Obsolète') THEN 'leaf' ELSE 'sous_ensemble' END
  FROM bom b JOIN produits p ON p.id = b.node
  WHERE p.statut IN ('Composant', 'Obsolète')                       -- feuille consommée
     OR (p_stock_aware AND (
          p.stock_actuel >= b.qty                                   -- sous-ensemble pris en stock
          OR NOT EXISTS (SELECT 1 FROM nomenclatures n2             -- produit fini sans BOM -> consommé (déficit)
                         WHERE n2.produit_assemble_id = b.node)))
  GROUP BY b.node, p.reference, p.nom, p.stock_actuel, p.seuil_alerte, p.statut;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Garde-fou anti-cycle au niveau base
--    Refuse l'auto-référence et tout cycle : on descend depuis NEW.composant_id ;
--    si on atteint NEW.produit_assemble_id, l'arête créerait une boucle.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION nomenclature_check_cycle() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.composant_id = NEW.produit_assemble_id THEN
    RAISE EXCEPTION 'Un produit ne peut pas être son propre composant';
  END IF;
  IF EXISTS (
    WITH RECURSIVE descend AS (
      SELECT NEW.composant_id AS node
      UNION
      SELECT n.composant_id FROM nomenclatures n JOIN descend d ON n.produit_assemble_id = d.node
    )
    SELECT 1 FROM descend WHERE node = NEW.produit_assemble_id
  ) THEN
    RAISE EXCEPTION 'Cette nomenclature créerait un cycle';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_nomenclature_cycle ON nomenclatures;
CREATE TRIGGER trg_nomenclature_cycle
  BEFORE INSERT OR UPDATE ON nomenclatures
  FOR EACH ROW EXECUTE FUNCTION nomenclature_check_cycle();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Helper UI : ids interdits comme composant de p_produit_id (lui-même + tous
--    ses ancêtres). Les ajouter créerait un cycle ; le sélecteur les masque.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION bom_invalid_components(p_produit_id UUID)
RETURNS TABLE (id UUID) LANGUAGE SQL STABLE AS $$
  WITH RECURSIVE ascend AS (
    SELECT p_produit_id AS node
    UNION
    SELECT n.produit_assemble_id FROM nomenclatures n JOIN ascend a ON n.composant_id = a.node
  )
  SELECT node FROM ascend;
$$;
