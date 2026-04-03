---
name: Workflow n8n - Validation Factures
description: Description du workflow n8n "[CAD42] Validation Factures - PDF > Gemini > Stock" et son integration avec l'app
type: project
---

## Workflow "[CAD42] Validation Factures - PDF > Gemini > Stock"

**Note** : ce workflow n'est pas visible via l'API n8n connectee a Claude. Il est sur une instance n8n self-hosted (v2.3.4).

### Pipeline

1. **Google Drive - Lister Factures** : liste les fichiers dans un dossier Drive specifique (`1jrCCp7eoeGbsdAVYBRsoXr36rK2CmUOX`)
2. **Filter** : filtre sur le nom du fichier (configurable)
3. **Google Drive - Telecharger PDF** : telecharge le PDF
4. **Preparer upload** : genere un `storagePath` unique (timestamp + filename)
5. **Upload PDF Supabase Storage** : upload dans le bucket `factures`
6. **Analyse Facture (Gemini)** : envoie le PDF a `gemini-3-pro-preview` pour extraction des lignes articles (JSON array)
7. **Parser JSON lignes** : parse la reponse Gemini, ajoute `pdf_storage_path`
8. **Charger catalogue produits** : GET sur `references_fournisseurs` (select: `produit_id,reference,fournisseur`)
9. **Aggregate** : regroupe les refs dans un objet `produits`
10. **Merge** : combine lignes facture + catalogue
11. **Matcher references catalogue** : matching fuzzy (bigrams + tokens + numbers) entre `ref_detectee` et les refs fournisseurs → produit_suggere_id + confiance_ia
12. **Inserer dans file_validation** : POST direct sur l'API REST Supabase (`/rest/v1/file_validation`)

### Matching (node Code)
- Utilise `references_fournisseurs.reference` pour le matching (pas `produits.reference` qui est la ref interne)
- Retourne `produit_id` (champ de `references_fournisseurs`, pas `id`)
- Seuils : >= 0.85 = "Connu", >= 0.35 = "Similaire", < 0.35 = "Inconnu"
- Score = bigram similarity * 0.35 + token overlap * 0.45 + number match * 0.2

### Points d'attention
- Le workflow insere directement via l'API REST Supabase (pas via le webhook Next.js `/api/webhook/validation`)
- Les credentials Supabase (anon key + service role key) sont en dur dans les headers des nodes HTTP
