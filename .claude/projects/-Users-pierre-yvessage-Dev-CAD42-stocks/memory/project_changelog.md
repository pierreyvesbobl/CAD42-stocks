---
name: Historique des evolutions du projet
description: Journal des changements majeurs du projet CAD42-stocks avec dates et contexte
type: project
---

## 2026-04-02 — Page Inventaire

**Contexte** : Besoin d'un mode inventaire simple pour faire le point sur les stocks physiques et corriger les ecarts.

**Changements** :
- Nouvelle page `/inventaire` avec tableau de saisie du stock constate
- Calcul d'ecarts en temps reel, filtres (famille, recherche, etat)
- Application en batch des ajustements avec creation de mouvements
- Ajout du lien "Inventaire" dans la sidebar

**Note** : Version simple sans persistance de session d'inventaire. Evolution possible vers un mode persiste (table `inventaires` + `inventaire_lignes`) pour garder l'historique.

## 2026-04-02 — Authentification utilisateur

**Contexte** : Besoin de proteger l'acces a l'application avec un login simple.

**Changements** :
- Migration de `@supabase/supabase-js` vers `@supabase/ssr` pour gestion des sessions via cookies
- Creation du proxy Next.js 16 (`src/proxy.ts`) pour proteger toutes les routes
- Page `/login` avec formulaire email/mot de passe
- Layout conditionnel (`AuthLayout`) : sidebar seulement quand authentifie
- Bouton deconnexion + email affiche dans la sidebar
- API routes migrees vers `createSupabaseAdmin()` (service role)
- Creation de l'utilisateur admin : rgarciabrotons@cad42.com

## 2026-04-02 — Refactoring produits : nom + references fournisseurs

**Contexte** : Un meme produit peut avoir plusieurs references fournisseurs differentes. L'ancien modele utilisait un seul champ `reference` sur `produits` qui melangeait ref fournisseur et identifiant produit.

**Changements** :
- Ajout du champ `nom` (NOT NULL) sur `produits` — identifiant principal dans l'UI
- Ajout du champ `reference` comme ref interne CAD-XXXX (auto-generee via sequence `produits_ref_seq`)
- Creation de la table `references_fournisseurs` (produit_id, reference UNIQUE, fournisseur) — relation 1-N
- Suppression du champ `fournisseur` de la table `produits`
- Migration des donnees existantes : ancien `reference` → `nom`, nouvelle ref interne generee, ancien couple reference+fournisseur → `references_fournisseurs`
- Mise a jour de toutes les RPCs (`resolve_bom`, `apply_fabrication`, `validate_file_validation`) et vues (`v_stock_bas`, `v_validation_pending`)
- Mise a jour de toutes les pages UI (catalogue, fiche produit, validation, fabrication, dashboard, mouvements)
- Mise a jour du combobox produit (recherche par nom, description et reference)
- Creation de produit depuis la validation : ref interne auto-generee, ref detectee de la facture auto-enregistree comme ref fournisseur
- Ajout d'une section "References fournisseurs" sur la fiche produit (ajout/suppression)
- Mise a jour du workflow n8n : query `references_fournisseurs` au lieu de `produits`, retourne `produit_id` au lieu de `id`

**Migration** : `supabase/migrations/20260402_add_nom_and_ref_fournisseurs.sql`

## 2026-03-31 — Initial commit

Setup initial du projet : Next.js 16, Supabase, structure de base avec catalogue, validation, fabrication, mouvements, dashboard.
