-- 1. Add 'nom' column to produits (initially nullable for migration)
ALTER TABLE produits ADD COLUMN nom TEXT;

-- 2. Create references_fournisseurs table
CREATE TABLE references_fournisseurs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id  UUID NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  reference   TEXT NOT NULL UNIQUE,
  fournisseur TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ref_fournisseurs_produit ON references_fournisseurs(produit_id);
CREATE INDEX idx_ref_fournisseurs_reference ON references_fournisseurs(reference);

-- RLS
ALTER TABLE references_fournisseurs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON references_fournisseurs FOR ALL USING (true);

-- 3. Migrate existing data:
--    - nom = old reference (product name)
--    - reference = new CAD-XXXX internal ref
--    - old reference + fournisseur → references_fournisseurs

-- Set nom from current reference
UPDATE produits SET nom = reference;

-- Move old reference + fournisseur into references_fournisseurs
INSERT INTO references_fournisseurs (produit_id, reference, fournisseur)
SELECT id, reference, fournisseur FROM produits;

-- Generate new internal references CAD-0001, CAD-0002, ...
UPDATE produits SET reference = 'CAD-' || LPAD(rn::TEXT, 4, '0')
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn FROM produits) sub
WHERE produits.id = sub.id;

-- 4. Make nom NOT NULL, drop fournisseur from produits
ALTER TABLE produits ALTER COLUMN nom SET NOT NULL;
ALTER TABLE produits DROP COLUMN fournisseur;

-- 5. Create sequence for future internal references
CREATE SEQUENCE produits_ref_seq START WITH 1;
SELECT setval('produits_ref_seq', (SELECT COUNT(*) FROM produits));

-- 6. Helper function to generate next internal reference
CREATE OR REPLACE FUNCTION next_internal_ref()
RETURNS TEXT LANGUAGE SQL AS $$
  SELECT 'CAD-' || LPAD(nextval('produits_ref_seq')::TEXT, 4, '0');
$$;

-- 7. Update resolve_bom to return nom instead of reference
DROP FUNCTION IF EXISTS resolve_bom(UUID, INTEGER);
CREATE OR REPLACE FUNCTION resolve_bom(p_produit_id UUID, p_quantite INTEGER DEFAULT 1)
RETURNS TABLE (
  composant_id UUID, reference TEXT, nom TEXT, quantite_necessaire NUMERIC,
  stock_actuel INTEGER, stock_apres INTEGER,
  is_deficit BOOLEAN, is_alerte BOOLEAN, seuil_alerte INTEGER
) LANGUAGE SQL STABLE AS $$
  WITH RECURSIVE bom AS (
    SELECT n.composant_id, n.quantite * p_quantite AS qty, 1 AS niveau,
           ARRAY[n.produit_assemble_id] AS chemin
    FROM nomenclatures n WHERE n.produit_assemble_id = p_produit_id
    UNION ALL
    SELECT n.composant_id, n.quantite * b.qty, b.niveau + 1, b.chemin || n.produit_assemble_id
    FROM nomenclatures n
    JOIN bom b ON n.produit_assemble_id = b.composant_id
    JOIN produits p ON p.id = b.composant_id
    WHERE p.statut <> 'Composant'
      AND NOT (n.produit_assemble_id = ANY(b.chemin)) AND b.niveau < 10
  )
  SELECT b.composant_id, p.reference, p.nom, SUM(b.qty),
    p.stock_actuel, p.stock_actuel - CAST(SUM(b.qty) AS INTEGER),
    (p.stock_actuel - SUM(b.qty)) < 0, (p.stock_actuel - SUM(b.qty)) <= p.seuil_alerte, p.seuil_alerte
  FROM bom b JOIN produits p ON p.id = b.composant_id
  WHERE p.statut = 'Composant'
  GROUP BY b.composant_id, p.reference, p.nom, p.stock_actuel, p.seuil_alerte;
$$;

-- 8. Update apply_fabrication to use nom
CREATE OR REPLACE FUNCTION apply_fabrication(
  p_produit_id UUID, p_quantite INTEGER, p_utilisateur TEXT DEFAULT 'Rafa'
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_name TEXT; v_comp RECORD;
  v_updated INTEGER := 0;
  v_deficits JSONB := '[]'::JSONB;
  v_alertes  JSONB := '[]'::JSONB;
BEGIN
  SELECT nom INTO v_name FROM produits WHERE id = p_produit_id;
  IF v_name IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Produit introuvable'); END IF;

  FOR v_comp IN SELECT * FROM resolve_bom(p_produit_id, p_quantite) LOOP
    UPDATE produits SET stock_actuel = v_comp.stock_apres, updated_at = NOW() WHERE id = v_comp.composant_id;
    INSERT INTO mouvements (description, type, source, produit_id, quantite, valide_par, date, notes)
    VALUES (
      'Fabrication — ' || v_name || ' x' || p_quantite || ' | ' || v_comp.nom,
      'Fabrication', 'Fabrication', v_comp.composant_id, -v_comp.quantite_necessaire,
      p_utilisateur, CURRENT_DATE,
      'Avant: ' || v_comp.stock_actuel || ' -> Apres: ' || v_comp.stock_apres ||
      CASE WHEN v_comp.is_deficit THEN ' -- STOCK NEGATIF' ELSE '' END
    );
    v_updated := v_updated + 1;
    IF v_comp.is_deficit THEN
      v_deficits := v_deficits || jsonb_build_object('nom', v_comp.nom, 'stock_apres', v_comp.stock_apres);
    END IF;
    IF v_comp.is_alerte THEN
      v_alertes := v_alertes || jsonb_build_object('nom', v_comp.nom, 'stock_apres', v_comp.stock_apres, 'seuil', v_comp.seuil_alerte);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true, 'produit', v_name, 'quantite_fabriquee', p_quantite,
    'composants_mis_a_jour', v_updated, 'deficits', v_deficits, 'alertes', v_alertes,
    'has_deficit', jsonb_array_length(v_deficits) > 0,
    'has_alerte', jsonb_array_length(v_alertes) > 0
  );
END; $$;

-- 9. Update validate_file_validation to use nom
CREATE OR REPLACE FUNCTION validate_file_validation(
  p_validation_id UUID, p_produit_id UUID, p_quantite NUMERIC, p_utilisateur TEXT DEFAULT 'Rafa'
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_ligne RECORD; v_nom TEXT;
BEGIN
  SELECT * INTO v_ligne FROM file_validation WHERE id = p_validation_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Ligne introuvable'); END IF;
  SELECT nom INTO v_nom FROM produits WHERE id = p_produit_id;
  UPDATE produits SET stock_actuel = stock_actuel + p_quantite, updated_at = NOW() WHERE id = p_produit_id;
  INSERT INTO mouvements (description, type, source, produit_id, quantite, valide_par, date, ref_facture)
  VALUES ('Entree facture — ' || v_nom || ' | ' || COALESCE(v_ligne.fournisseur, ''),
    'Entrée', 'Facture auto', p_produit_id, p_quantite,
    p_utilisateur, COALESCE(v_ligne.date_facture, CURRENT_DATE), v_ligne.ref_facture);
  UPDATE file_validation SET statut = 'Validé', valide_par = p_utilisateur, updated_at = NOW() WHERE id = p_validation_id;
  RETURN jsonb_build_object('success', true, 'produit', v_nom, 'quantite_ajoutee', p_quantite);
END; $$;

-- 10. Update views to include nom
DROP VIEW IF EXISTS v_stock_bas;
CREATE OR REPLACE VIEW v_stock_bas AS
SELECT id, reference, nom, famille, statut, stock_actuel, seuil_alerte, stock_actuel - seuil_alerte AS marge
FROM produits WHERE stock_actuel <= seuil_alerte AND seuil_alerte > 0 ORDER BY marge ASC;

DROP VIEW IF EXISTS v_validation_pending;
CREATE OR REPLACE VIEW v_validation_pending AS
SELECT fv.*, p.nom AS produit_suggere_nom
FROM file_validation fv LEFT JOIN produits p ON p.id = fv.produit_suggere_id
WHERE fv.statut = 'À valider' ORDER BY fv.created_at DESC;
