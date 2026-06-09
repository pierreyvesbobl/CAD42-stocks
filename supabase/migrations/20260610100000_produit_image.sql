-- Miniature produit (une image principale par produit), extraite du lien
-- fournisseur (og:image). Stockée par hotlink : on garde l'URL distante.
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS image_url    TEXT,
  ADD COLUMN IF NOT EXISTS image_maj_le TIMESTAMPTZ;
