-- Lien direct vers la fiche produit chez le fournisseur (URL HTTP).
-- Rempli automatiquement par l'agent de matching Amazon (ou autre) quand un
-- candidat plausible est trouvé (titre similaire + prix dans une fourchette).
-- L'humain peut le corriger.

ALTER TABLE references_fournisseurs
  ADD COLUMN IF NOT EXISTS lien_url TEXT,
  ADD COLUMN IF NOT EXISTS lien_verifie_le TIMESTAMPTZ;
