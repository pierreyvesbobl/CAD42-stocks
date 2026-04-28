-- Settings global de l'app (lisible côté client) + catalogue d'agents IA.
--
-- app_settings_public: clé/valeur lisible par anon (paramètres non-sensibles
-- comme le seuil d'alerte par défaut). Distinct d'app_settings qui reste
-- réservé au service_role pour les secrets.

CREATE TABLE IF NOT EXISTS app_settings_public (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_settings_public ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all_public_settings" ON app_settings_public FOR SELECT USING (true);
CREATE POLICY "write_all_public_settings" ON app_settings_public FOR ALL USING (true) WITH CHECK (true);

INSERT INTO app_settings_public (key, value)
VALUES ('default_seuil_alerte', '5')
ON CONFLICT (key) DO NOTHING;

-- agents_prompts: catalogue des prompts utilisés par les agents IA, avec
-- versionning simple par updated_at. La colonne `code` identifie l'agent
-- côté code (jointure logique dans gemini.ts, etc.).

CREATE TABLE IF NOT EXISTS agents_prompts (
  code        TEXT PRIMARY KEY,
  nom         TEXT NOT NULL,
  description TEXT,
  prompt      TEXT NOT NULL,
  modele      TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agents_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all_agents" ON agents_prompts FOR SELECT USING (true);
-- Pas d'écriture depuis le client par défaut: l'écriture passe par migration
-- ou par le service_role, pour éviter d'altérer un prompt actif sans audit.

CREATE TRIGGER trg_agents_prompts_updated_at
  BEFORE UPDATE ON agents_prompts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO agents_prompts (code, nom, description, prompt, modele)
VALUES
  ('facture_extract',
   'Extraction de factures',
   'Classifie une facture et extrait ses lignes article. Décide si la facture concerne des produits stockables ; si oui, retourne une ligne par article physique avec ref_detectee, quantite, prix, fournisseur, ref_facture, date_facture.',
   '(géré dans src/lib/factures/gemini.ts — synchronisé par migration)',
   'gemini-3-pro-preview'),
  ('facture_reference_interne',
   'Génération de référence interne',
   'Pour un article extrait d''une facture, génère un nom de référence interne CAD42 normalisé : description + taille + specs techniques de base, sans inclure la référence fournisseur. Sert au pré-matching ou à la suggestion de nom de composant.',
   '(géré dans src/lib/factures/reference-agent.ts — synchronisé par migration)',
   'gemini-3-pro-preview')
ON CONFLICT (code) DO NOTHING;
