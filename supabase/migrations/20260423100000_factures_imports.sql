-- Suivi des factures importées (dedup côté DB, indépendant d'Outlook).
-- La dedup primaire se fait via pdf_hash (SHA-256 du PDF).

CREATE TABLE factures_imports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source                TEXT NOT NULL CHECK (source IN ('outlook', 'upload')),
  pdf_hash              TEXT,
  outlook_message_id    TEXT,
  outlook_attachment_id TEXT,
  file_name             TEXT,
  pdf_storage_path      TEXT NOT NULL,
  ref_facture           TEXT,
  fournisseur           TEXT,
  date_facture          DATE,
  lignes_count          INT NOT NULL DEFAULT 0,
  imported_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index partiel: seulement quand pdf_hash est renseigné
-- (les backfills historiques sans hash peuvent coexister).
CREATE UNIQUE INDEX idx_factures_imports_pdf_hash
  ON factures_imports (pdf_hash)
  WHERE pdf_hash IS NOT NULL;

CREATE INDEX idx_factures_imports_outlook_msg
  ON factures_imports (outlook_message_id, outlook_attachment_id)
  WHERE outlook_message_id IS NOT NULL;

CREATE INDEX idx_factures_imports_ref ON factures_imports(ref_facture);
CREATE INDEX idx_factures_imports_storage ON factures_imports(pdf_storage_path);

ALTER TABLE factures_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON factures_imports FOR ALL USING (true);
