CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE produits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_id     TEXT UNIQUE,
  reference     TEXT NOT NULL UNIQUE,
  famille       TEXT CHECK (famille IN ('RTK', 'Kit', 'Gateway', 'Accessoire', 'Autre')),
  fournisseur   TEXT,
  prix_ht       NUMERIC(10,2) DEFAULT 0,
  statut        TEXT CHECK (statut IN ('Composant', 'Produit fini', 'Location', 'Obsolète')),
  stock_actuel  INTEGER DEFAULT 0,
  seuil_alerte  INTEGER DEFAULT 0,
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE nomenclatures (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_assemble_id UUID NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  composant_id        UUID NOT NULL REFERENCES produits(id) ON DELETE RESTRICT,
  quantite            NUMERIC(10,3) NOT NULL DEFAULT 1,
  variante_acceptee   TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(produit_assemble_id, composant_id)
);

CREATE TABLE mouvements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  type        TEXT CHECK (type IN ('Entrée', 'Sortie', 'Fabrication', 'Ajustement')),
  produit_id  UUID REFERENCES produits(id),
  quantite    NUMERIC(10,3),
  source      TEXT CHECK (source IN ('Facture auto', 'Fabrication', 'Manuel', 'Ajustement')),
  ref_facture TEXT,
  valide_par  TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE file_validation (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ligne               TEXT NOT NULL,
  statut              TEXT CHECK (statut IN ('À valider', 'Validé', 'Rejeté', 'Doublons')) DEFAULT 'À valider',
  confiance_ia        TEXT CHECK (confiance_ia IN ('Connu', 'Similaire', 'Inconnu')),
  produit_suggere_id  UUID REFERENCES produits(id),
  ref_detectee        TEXT,
  quantite            NUMERIC(10,3),
  prix_ht_unitaire    NUMERIC(10,2),
  fournisseur         TEXT,
  ref_facture         TEXT,
  date_facture        DATE,
  valide_par          TEXT,
  notes               TEXT,
  pdf_storage_path    TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_produits_statut        ON produits(statut);
CREATE INDEX idx_produits_famille       ON produits(famille);
CREATE INDEX idx_produits_stock         ON produits(stock_actuel);
CREATE INDEX idx_nomenclatures_assemble ON nomenclatures(produit_assemble_id);
CREATE INDEX idx_mouvements_produit     ON mouvements(produit_id);
CREATE INDEX idx_mouvements_date        ON mouvements(date DESC);
CREATE INDEX idx_file_validation_statut ON file_validation(statut);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_produits_updated_at
  BEFORE UPDATE ON produits FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_file_validation_updated_at
  BEFORE UPDATE ON file_validation FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RPC : résolution BOM récursive
CREATE OR REPLACE FUNCTION resolve_bom(p_produit_id UUID, p_quantite INTEGER DEFAULT 1)
RETURNS TABLE (
  composant_id UUID, reference TEXT, quantite_necessaire NUMERIC,
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
  SELECT b.composant_id, p.reference, SUM(b.qty),
    p.stock_actuel, p.stock_actuel - CAST(SUM(b.qty) AS INTEGER),
    (p.stock_actuel - SUM(b.qty)) < 0, (p.stock_actuel - SUM(b.qty)) <= p.seuil_alerte, p.seuil_alerte
  FROM bom b JOIN produits p ON p.id = b.composant_id
  WHERE p.statut = 'Composant'
  GROUP BY b.composant_id, p.reference, p.stock_actuel, p.seuil_alerte;
$$;

-- RPC : appliquer une fabrication
CREATE OR REPLACE FUNCTION apply_fabrication(
  p_produit_id UUID, p_quantite INTEGER, p_utilisateur TEXT DEFAULT 'Rafa'
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_name TEXT; v_comp RECORD;
  v_updated INTEGER := 0;
  v_deficits JSONB := '[]'::JSONB;
  v_alertes  JSONB := '[]'::JSONB;
BEGIN
  SELECT reference INTO v_name FROM produits WHERE id = p_produit_id;
  IF v_name IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Produit introuvable'); END IF;

  FOR v_comp IN SELECT * FROM resolve_bom(p_produit_id, p_quantite) LOOP
    UPDATE produits SET stock_actuel = v_comp.stock_apres, updated_at = NOW() WHERE id = v_comp.composant_id;
    INSERT INTO mouvements (description, type, source, produit_id, quantite, valide_par, date, notes)
    VALUES (
      'Fabrication — ' || v_name || ' ×' || p_quantite || ' | ' || v_comp.reference,
      'Fabrication', 'Fabrication', v_comp.composant_id, -v_comp.quantite_necessaire,
      p_utilisateur, CURRENT_DATE,
      'Avant: ' || v_comp.stock_actuel || ' → Après: ' || v_comp.stock_apres ||
      CASE WHEN v_comp.is_deficit THEN ' ⚠️ STOCK NÉGATIF' ELSE '' END
    );
    v_updated := v_updated + 1;
    IF v_comp.is_deficit THEN
      v_deficits := v_deficits || jsonb_build_object('reference', v_comp.reference, 'stock_apres', v_comp.stock_apres);
    END IF;
    IF v_comp.is_alerte THEN
      v_alertes := v_alertes || jsonb_build_object('reference', v_comp.reference, 'stock_apres', v_comp.stock_apres, 'seuil', v_comp.seuil_alerte);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true, 'produit', v_name, 'quantite_fabriquee', p_quantite,
    'composants_mis_a_jour', v_updated, 'deficits', v_deficits, 'alertes', v_alertes,
    'has_deficit', jsonb_array_length(v_deficits) > 0,
    'has_alerte', jsonb_array_length(v_alertes) > 0
  );
END; $$;

-- RPC : valider une ligne de facture
CREATE OR REPLACE FUNCTION validate_file_validation(
  p_validation_id UUID, p_produit_id UUID, p_quantite NUMERIC, p_utilisateur TEXT DEFAULT 'Rafa'
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_ligne RECORD; v_ref TEXT;
BEGIN
  SELECT * INTO v_ligne FROM file_validation WHERE id = p_validation_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Ligne introuvable'); END IF;
  SELECT reference INTO v_ref FROM produits WHERE id = p_produit_id;
  UPDATE produits SET stock_actuel = stock_actuel + p_quantite, updated_at = NOW() WHERE id = p_produit_id;
  INSERT INTO mouvements (description, type, source, produit_id, quantite, valide_par, date, ref_facture)
  VALUES ('Entrée facture — ' || v_ref || ' | ' || COALESCE(v_ligne.fournisseur, ''),
    'Entrée', 'Facture auto', p_produit_id, p_quantite,
    p_utilisateur, COALESCE(v_ligne.date_facture, CURRENT_DATE), v_ligne.ref_facture);
  UPDATE file_validation SET statut = 'Validé', valide_par = p_utilisateur, updated_at = NOW() WHERE id = p_validation_id;
  RETURN jsonb_build_object('success', true, 'produit', v_ref, 'quantite_ajoutee', p_quantite);
END; $$;

-- RLS (permissif pour démarrer)
ALTER TABLE produits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE nomenclatures   ENABLE ROW LEVEL SECURITY;
ALTER TABLE mouvements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_validation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON produits        FOR ALL USING (true);
CREATE POLICY "allow_all" ON nomenclatures   FOR ALL USING (true);
CREATE POLICY "allow_all" ON mouvements      FOR ALL USING (true);
CREATE POLICY "allow_all" ON file_validation FOR ALL USING (true);

-- Vues
CREATE OR REPLACE VIEW v_stock_bas AS
SELECT id, reference, famille, statut, stock_actuel, seuil_alerte, stock_actuel - seuil_alerte AS marge
FROM produits WHERE stock_actuel <= seuil_alerte AND seuil_alerte > 0 ORDER BY marge ASC;

CREATE OR REPLACE VIEW v_validation_pending AS
SELECT fv.*, p.reference AS produit_suggere_reference
FROM file_validation fv LEFT JOIN produits p ON p.id = fv.produit_suggere_id
WHERE fv.statut = 'À valider' ORDER BY fv.created_at DESC;
