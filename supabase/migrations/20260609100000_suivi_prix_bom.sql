-- Suivi de l'évolution des prix + coût BOM en cascade.
--
-- 1. Historique « prix précédent » sur produits (colonnes + trigger) : permet
--    d'afficher une flèche ↑/↓ par rapport à la dernière modification, quelle
--    que soit la source du changement (édition manuelle OU validation facture).
-- 2. validate_file_validation : le dernier achat définit le prix du composant,
--    et ajoute une réf fournisseur supplémentaire si la réf détectée diffère.
-- 3. resolve_bom : renvoie aussi prix_ht par feuille, pour calculer le coût d'un
--    produit fini depuis sa nomenclature (cascade gérée par l'explosion existante).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Historique du prix précédent
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS prix_ht_precedent NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS prix_ht_maj_le    TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION produits_prix_history() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.prix_ht IS DISTINCT FROM OLD.prix_ht THEN
    NEW.prix_ht_precedent := OLD.prix_ht;
    NEW.prix_ht_maj_le    := NOW();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_produits_prix_history ON produits;
CREATE TRIGGER trg_produits_prix_history
  BEFORE UPDATE ON produits
  FOR EACH ROW EXECUTE FUNCTION produits_prix_history();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Validation facture : prix + réf fournisseur (le dernier achat fait foi)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION validate_file_validation(
  p_validation_id UUID, p_produit_id UUID, p_quantite NUMERIC, p_utilisateur TEXT DEFAULT 'Rafa'
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_ligne RECORD; v_nom TEXT;
BEGIN
  SELECT * INTO v_ligne FROM file_validation WHERE id = p_validation_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Ligne introuvable'); END IF;
  SELECT nom INTO v_nom FROM produits WHERE id = p_produit_id;
  UPDATE produits SET stock_actuel = stock_actuel + p_quantite, updated_at = NOW() WHERE id = p_produit_id;

  -- Le dernier achat définit le prix : on écrase prix_ht avec le prix unitaire
  -- facturé (le trigger d'historique enregistre l'ancien prix → flèche).
  IF v_ligne.prix_ht_unitaire IS NOT NULL AND v_ligne.prix_ht_unitaire > 0 THEN
    UPDATE produits SET prix_ht = v_ligne.prix_ht_unitaire WHERE id = p_produit_id;
  END IF;

  -- Réf fournisseur supplémentaire si la réf détectée diffère de celles déjà
  -- connues pour ce produit (unicité (produit_id, reference) → DO NOTHING sinon).
  IF v_ligne.ref_detectee IS NOT NULL AND btrim(v_ligne.ref_detectee) <> '' THEN
    INSERT INTO references_fournisseurs (produit_id, reference, fournisseur)
    VALUES (p_produit_id, btrim(v_ligne.ref_detectee), v_ligne.fournisseur)
    ON CONFLICT (produit_id, reference) DO NOTHING;
  END IF;

  INSERT INTO mouvements (description, type, source, produit_id, quantite, valide_par, date, ref_facture, date_facture)
  VALUES ('Entree facture — ' || v_nom || ' | ' || COALESCE(v_ligne.fournisseur, ''),
    'Entrée', 'Facture auto', p_produit_id, p_quantite,
    p_utilisateur, COALESCE(v_ligne.date_facture, CURRENT_DATE), v_ligne.ref_facture,
    v_ligne.date_facture);
  UPDATE file_validation SET statut = 'Validé', valide_par = p_utilisateur, updated_at = NOW() WHERE id = p_validation_id;
  RETURN jsonb_build_object('success', true, 'produit', v_nom, 'quantite_ajoutee', p_quantite);
END; $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. resolve_bom v3 — identique à la v2 (BOM imbriquées), avec prix_ht en plus
--    sur chaque ligne pour permettre le calcul du coût en cascade côté UI.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS resolve_bom(UUID, INTEGER, BOOLEAN);
CREATE OR REPLACE FUNCTION resolve_bom(
  p_produit_id UUID, p_quantite INTEGER DEFAULT 1, p_stock_aware BOOLEAN DEFAULT false
)
RETURNS TABLE (
  composant_id UUID, reference TEXT, nom TEXT, quantite_necessaire NUMERIC,
  stock_actuel INTEGER, stock_apres INTEGER,
  is_deficit BOOLEAN, is_alerte BOOLEAN, seuil_alerte INTEGER, section TEXT,
  statut TEXT, kind TEXT, prix_ht NUMERIC
) LANGUAGE SQL STABLE AS $$
  WITH RECURSIVE bom AS (
    SELECT n.composant_id AS node, n.quantite * p_quantite AS qty, 1 AS niveau,
           ARRAY[n.produit_assemble_id] AS chemin, n.section AS section
    FROM nomenclatures n WHERE n.produit_assemble_id = p_produit_id
    UNION ALL
    SELECT n.composant_id, n.quantite * b.qty, b.niveau + 1,
           b.chemin || b.node, COALESCE(parent.nom, n.section)
    FROM bom b
    JOIN produits pnode ON pnode.id = b.node
    JOIN nomenclatures n ON n.produit_assemble_id = b.node
    JOIN produits parent ON parent.id = b.node
    WHERE pnode.statut NOT IN ('Composant', 'Obsolète')
      AND (NOT p_stock_aware OR pnode.stock_actuel < b.qty)
      AND NOT (b.node = ANY(b.chemin)) AND b.niveau < 10
  )
  SELECT b.node, p.reference, p.nom, SUM(b.qty),
         p.stock_actuel, p.stock_actuel - CAST(SUM(b.qty) AS INTEGER),
         (p.stock_actuel - SUM(b.qty)) < 0,
         (p.stock_actuel - SUM(b.qty)) <= p.seuil_alerte, p.seuil_alerte,
         MIN(b.section) AS section,
         p.statut,
         CASE WHEN p.statut IN ('Composant', 'Obsolète') THEN 'leaf' ELSE 'sous_ensemble' END,
         p.prix_ht
  FROM bom b JOIN produits p ON p.id = b.node
  WHERE p.statut IN ('Composant', 'Obsolète')
     OR (p_stock_aware AND (
          p.stock_actuel >= b.qty
          OR NOT EXISTS (SELECT 1 FROM nomenclatures n2
                         WHERE n2.produit_assemble_id = b.node)))
  GROUP BY b.node, p.reference, p.nom, p.stock_actuel, p.seuil_alerte, p.statut, p.prix_ht;
$$;
