-- Ajout date_facture sur mouvements pour permettre tri double (date mvt + date facture)
-- côté UI sans dépendre d'un join sur file_validation.

ALTER TABLE mouvements ADD COLUMN IF NOT EXISTS date_facture DATE;

CREATE INDEX IF NOT EXISTS idx_mouvements_date_facture
  ON mouvements(date_facture DESC NULLS LAST);

-- Backfill: pour les entrées issues de factures, on récupère la date_facture
-- depuis file_validation via ref_facture.
UPDATE mouvements m
SET date_facture = fv.date_facture
FROM file_validation fv
WHERE m.date_facture IS NULL
  AND m.ref_facture IS NOT NULL
  AND m.ref_facture = fv.ref_facture
  AND fv.date_facture IS NOT NULL;

-- Validation RPC: persiste la date_facture sur le mouvement créé.
CREATE OR REPLACE FUNCTION validate_file_validation(
  p_validation_id UUID, p_produit_id UUID, p_quantite NUMERIC, p_utilisateur TEXT DEFAULT 'Rafa'
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_ligne RECORD; v_nom TEXT;
BEGIN
  SELECT * INTO v_ligne FROM file_validation WHERE id = p_validation_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Ligne introuvable'); END IF;
  SELECT nom INTO v_nom FROM produits WHERE id = p_produit_id;
  UPDATE produits SET stock_actuel = stock_actuel + p_quantite, updated_at = NOW() WHERE id = p_produit_id;
  INSERT INTO mouvements (description, type, source, produit_id, quantite, valide_par, date, ref_facture, date_facture)
  VALUES ('Entree facture — ' || v_nom || ' | ' || COALESCE(v_ligne.fournisseur, ''),
    'Entrée', 'Facture auto', p_produit_id, p_quantite,
    p_utilisateur, COALESCE(v_ligne.date_facture, CURRENT_DATE), v_ligne.ref_facture,
    v_ligne.date_facture);
  UPDATE file_validation SET statut = 'Validé', valide_par = p_utilisateur, updated_at = NOW() WHERE id = p_validation_id;
  RETURN jsonb_build_object('success', true, 'produit', v_nom, 'quantite_ajoutee', p_quantite);
END; $$;
