---
name: Architecture et fonctionnalites CAD42-stocks
description: Vue d'ensemble de l'application de gestion de stock CAD42 - stack, pages, base de donnees, workflow n8n
type: project
---

## Stack technique

- **Frontend** : Next.js 16.2.1 (App Router, Turbopack), React 19, Tailwind CSS 4, shadcn/ui
- **Backend** : Supabase (PostgreSQL, Storage, RPC functions, RLS)
- **Automatisation** : n8n (self-hosted v2.3.4) pour l'import de factures via Gemini
- **Deploiement** : localhost:3000 en dev/prod locale

## Pages et fonctionnalites

### Dashboard (`/dashboard`)
- KPIs : stock negatif, sous seuil d'alerte, en attente validation, mouvements du jour
- Tableau alertes stock (vue `v_stock_bas`)
- Derniers mouvements

### Catalogue (`/catalogue`)
- Liste de tous les produits avec filtres famille/statut
- Affiche : nom, description, ref interne (CAD-XXXX), famille, statut, prix HT, stock
- Clic sur un produit ouvre la fiche detail

### Fiche produit (`/catalogue/[id]`)
- Nom du produit en titre, ref interne en sous-titre
- Edition : nom, famille, statut, prix HT, seuil alerte, description
- Ajustement manuel du stock (cree un mouvement automatique)
- Section "References fournisseurs" : ajout/suppression de refs fournisseurs liees
- Nomenclature BOM (pour produits finis, via RPC `resolve_bom`)
- Derniers mouvements du produit

### Validation (`/validation`)
- Import de factures fournisseurs (lignes dans `file_validation`)
- Vue par facture avec onglets (a traiter / traitees / toutes)
- Pour chaque ligne : combobox de matching produit, quantite, valider/rejeter
- Creation de produit a la volee (nom + famille + statut + prix, ref interne auto-generee)
- La ref detectee de la facture est auto-enregistree comme ref fournisseur
- Visualisation PDF (signed URL via `/api/facture-pdf`)

### Fabrication (`/fabrication`)
- Selection d'un produit fini + quantite + operateur
- Apercu BOM avant fabrication
- Lancement via RPC `apply_fabrication` (decremente composants, cree mouvements)
- Affichage deficits et alertes

### Mouvements (`/mouvements`)
- Historique pagine de tous les mouvements de stock
- Filtres : type, ref facture, recherche texte
- Edition d'un mouvement (recalcul auto du stock)
- Suppression (avec reversal du stock)
- Selection batch pour suppression groupee
- Lien PDF sur les mouvements de type facture

### Inventaire (`/inventaire`)
- Tableau de tous les produits avec stock systeme et champ de saisie "stock constate"
- Calcul d'ecart en temps reel (vert si OK, orange si ecart, avec +/-)
- Filtres : famille, recherche texte, etat (tous / avec ecart / verifies / non verifies)
- Compteur en haut : X/Y verifies + nombre d'ecarts
- Bouton "Appliquer les ecarts" : recap des ajustements, saisie operateur, application en batch
- Cree des mouvements de type "Ajustement" avec notes detaillees (systeme X → constate Y)
- Mode simple sans persistance (pas de session d'inventaire sauvegardee)

### Login (`/login`)
- Formulaire email/mot de passe avec logo CAD42
- Authentification via Supabase Auth
- Redirection vers /dashboard apres connexion

## Base de donnees

### Tables
- **produits** : id, reference (ref interne CAD-XXXX, UNIQUE), nom (NOT NULL), famille, statut, prix_ht, stock_actuel, seuil_alerte, description
- **references_fournisseurs** : id, produit_id (FK), reference (ref fournisseur, UNIQUE), fournisseur
- **nomenclatures** : produit_assemble_id, composant_id, quantite, variante_acceptee
- **mouvements** : description, date, type, produit_id, quantite, source, ref_facture, valide_par, notes
- **file_validation** : ligne, statut, confiance_ia, produit_suggere_id, ref_detectee, quantite, prix_ht_unitaire, fournisseur, ref_facture, date_facture, pdf_storage_path

### RPC functions
- `resolve_bom(produit_id, quantite)` : resolution recursive de nomenclature
- `apply_fabrication(produit_id, quantite, utilisateur)` : execute une fabrication
- `validate_file_validation(validation_id, produit_id, quantite, utilisateur)` : valide une ligne de facture
- `next_internal_ref()` : genere la prochaine ref interne CAD-XXXX

### Vues
- `v_stock_bas` : produits sous seuil d'alerte
- `v_validation_pending` : lignes de validation en attente

### Sequence
- `produits_ref_seq` : sequence pour generation des refs internes

## Authentification

- **Supabase Auth** avec `@supabase/ssr` pour gestion des sessions via cookies
- **Proxy (middleware Next.js 16)** : `src/proxy.ts` — intercepte toutes les requetes, redirige vers `/login` si non connecte, laisse passer les API routes
- **Client browser** : `createBrowserClient()` via `@supabase/ssr` (src/lib/supabase/client.ts)
- **Client server** : `createServerClient()` via `@supabase/ssr` avec gestion cookies (src/lib/supabase/server.ts)
- **Client admin** : `createSupabaseAdmin()` avec service role key (pour API routes, webhooks — bypass RLS)
- **Layout conditionnel** : `AuthLayout` component — affiche la sidebar seulement si pas sur /login
- **Deconnexion** : bouton dans la sidebar avec email affiche
- **Utilisateur admin** : rgarciabrotons@cad42.com (cree via Supabase Auth admin API)

## API routes
- `POST /api/webhook/validation` : webhook n8n pour inserer des lignes de validation (protege par `x-webhook-secret`)
- `GET /api/facture-pdf?ref=XXX` : retourne une signed URL pour le PDF d'une facture

## Composants cles
- `ProductCombobox` : dropdown recherchable par nom, description et reference, avec option "creer un nouveau produit"
- `StockBadge` : badge colore selon le niveau de stock vs seuil
- `SidebarNav` : navigation laterale avec badge validation pending, email utilisateur, bouton deconnexion
- `AuthLayout` : layout conditionnel qui affiche la sidebar sauf sur /login
