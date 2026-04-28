-- Lien fournisseur trouvé automatiquement à l'import par l'agent Amazon
-- (description + prix). Persisté sur file_validation et propagé à
-- references_fournisseurs à la validation de la ligne.

ALTER TABLE file_validation
  ADD COLUMN IF NOT EXISTS lien_url TEXT,
  ADD COLUMN IF NOT EXISTS lien_url_source TEXT;
