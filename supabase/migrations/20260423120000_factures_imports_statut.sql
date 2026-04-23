-- Classification en amont des imports: accepte (envoyé à Gemini pour extraction)
-- vs rejete (facture non-stockable, aucune ligne file_validation créée).

ALTER TABLE factures_imports
  ADD COLUMN statut_import TEXT NOT NULL DEFAULT 'accepte'
    CHECK (statut_import IN ('accepte', 'rejete', 'traitement_echoue')),
  ADD COLUMN categorie     TEXT,
  ADD COLUMN raison_rejet  TEXT;

CREATE INDEX idx_factures_imports_statut ON factures_imports(statut_import);

-- Backfill: la facture Alan (placeholder-only) devient "rejete" explicite.
-- On supprime aussi la ligne placeholder dans file_validation.
DELETE FROM file_validation
WHERE pdf_storage_path IN (
  SELECT pdf_storage_path FROM factures_imports
  WHERE file_name LIKE 'Alan %Prevoyance%'
);

UPDATE factures_imports
SET statut_import = 'rejete',
    categorie = 'insurance',
    raison_rejet = 'Facture de prévoyance — pas de produits stockables',
    lignes_count = 0,
    ref_facture = NULL
WHERE file_name LIKE 'Alan %Prevoyance%';
