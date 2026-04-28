-- Champs supportant les nouveaux agents IA (lots + référence interne).
--
-- - lot_size / lot_source: trace que la ligne a été décomposée à partir d'un
--   conditionnement (ex. "lot de 5"). Permet d'afficher l'origine et de revenir
--   en arrière si l'humain conteste la décomposition.
-- - suggested_nom / suggested_famille / suggested_description: pré-remplissage
--   proposé par l'agent référence interne pour la création d'un nouveau
--   composant. L'humain peut accepter tel quel ou éditer.

ALTER TABLE file_validation
  ADD COLUMN IF NOT EXISTS lot_size INTEGER,
  ADD COLUMN IF NOT EXISTS lot_source TEXT,
  ADD COLUMN IF NOT EXISTS suggested_nom TEXT,
  ADD COLUMN IF NOT EXISTS suggested_famille TEXT,
  ADD COLUMN IF NOT EXISTS suggested_description TEXT;
