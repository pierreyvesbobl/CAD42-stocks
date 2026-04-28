import { GoogleGenAI } from '@google/genai'
import type { LigneFacture } from './gemini'

// Catalogue minimal qu'on envoie au LLM pour qu'il propose un match existant
// avant de suggérer un nouveau nom. Sans ça, le modèle inventerait.
export type CatalogueComposant = {
  id: string
  nom: string
  reference: string
  famille: string | null
}

export type ReferenceSuggestion = {
  // Si l'agent estime qu'un composant existant correspond avec une confiance
  // élevée, il renvoie son id. UI propose ensuite le match à l'humain.
  existing_match_id: string | null
  existing_match_confiance: 'haute' | 'moyenne' | 'basse' | 'aucune'

  // Nom de référence interne suggéré pour ce produit, normalisé selon la
  // nomenclature CAD42 (description + taille/specs), sans inclure la ref
  // fournisseur. Toujours non-vide pour ne jamais laisser le validateur
  // humain devant un champ blanc.
  suggested_nom: string

  // Famille déduite parmi les familles CAD42 connues, fallback "Autre".
  suggested_famille: string

  // Description technique courte exploitable côté fiche produit (#8).
  suggested_description: string
}

const NOMENCLATURE_GUIDE = `Nomenclature CAD42 — exemples concrets de noms à produire :
- "Aimant en pot avec trou fraisé Ø 40 mm"
- "Aimant Goodies"
- "Attiny85"
- "Avertisseur sonore"
- "Balise Fixe à LED"
- "Batterie LifeBatteries + embouts 2,5 mm"
- "Boitier"
- "Boitier de protection"
- "Boitier interne pour électronique"
- "Boulon M4 L20 inox - tête autofraisée plate"
- "Boulon raspberry pi M2,5"
- "Câble"
- "Câble alimentation 22 AWG"
- "Câble alimentation 220V 1m80"
- "Câble alimentation Sick"
- "Câble d'antenne SMA femelle vers IPX"
- "Câble de sécu inox 1,5m M4 embouts à chape D8"
- "Câble Ethernet Sick"
- "Câble rouge et noir 0,5m"
- "Câble rouge et noir 1m"
- "Carte d'acquisition vidéo HDMI USB-C"
- "Carte SD Sandisk"
- "Chargeur 4,2V TP4056"
- "Chargeur USB Basetech SUC-4900/4"
- "Chargeurs Mascot 2541 2A"
- "Clé 4G Alcatel"
- "Condensateur 0,1 uF"
- "Condensateur 0,33 uF"
- "Diode Protec 1n4001"
- "Embout chargeur Mascot 2,5 × 5,5 mm"
- "Embout pour chargeur TP"
- "Equerre externe"
- "GoPro"
- "GPS RTK Ublox"
- "Gyro Rouge"
- "Harnais"
- "Hub USB 6 en 1"
- "Joint d'étanchéité"
- "LED"
- "PCB KYD Transfo vierge"
- "Peson manille Crosby 12T"
- "Peson manille Crosby 25T"
- "Plaque de fond galvanisée"
- "Presse-étoupes M12 (PG07)"
- "Presse-étoupes PG11 (M16)"
- "Raspberry Pi 3 modèle B+ 1Gb"
- "Régulateur de tension L7805"
- "Resistance 1k Ohm"
- "TIP120"
- "Tournette"
- "Valise TOMcase"
- "Wago 2", "Wago 3", "Wago 5"
- "Witty Pi 4 Mini"

Règles :
- Description usage (ex: "Câble alimentation") + spec marquante (taille, valeur,
  longueur, couleur, marque si elle est l'identité du produit comme "Sick" ou
  "Sandisk").
- N'inclus PAS la référence fournisseur (Amazon ASIN, Mouser, code distributeur).
- Marque optionnelle, uniquement si elle distingue le composant
  (Raspberry Pi, Sandisk, Mascot, Sick, Ublox, GoPro).
- Pas de quantité, pas de prix, pas de "x10".
- Pas de majuscules ALL CAPS, pas de _ ou tirets stylistiques.
- Familles disponibles : RTK, Kit, Gateway, Accessoire, Autre.`

const PROMPT = `Tu es l'agent "référence interne" de CAD42. Tu reçois UNE ligne extraite
d'une facture fournisseur et un catalogue de composants existants. Ta tâche :

1. Décide si la ligne correspond à un composant DÉJÀ présent dans le catalogue.
   Si oui, renvoie son id dans "existing_match_id" avec un niveau de confiance.
   Tolère les variantes orthographiques, abréviations, descriptions partielles.

2. Que tu trouves un match ou non, propose TOUJOURS un nom de référence interne
   normalisé selon la nomenclature CAD42 ci-dessous. Ce nom servira à créer un
   nouveau composant si l'humain valide la suggestion ; il ne doit donc JAMAIS
   être vide.

3. Propose une famille parmi : RTK, Kit, Gateway, Accessoire, Autre.

4. Propose une description courte (1-2 phrases techniques) exploitable côté
   fiche produit interne.

${NOMENCLATURE_GUIDE}

Retourne UNIQUEMENT un JSON valide, sans markdown :
{
  "existing_match_id": "uuid ou null",
  "existing_match_confiance": "haute" | "moyenne" | "basse" | "aucune",
  "suggested_nom": "nom normalisé (jamais vide)",
  "suggested_famille": "RTK" | "Kit" | "Gateway" | "Accessoire" | "Autre",
  "suggested_description": "description technique courte (jamais vide)"
}`

const MODEL = 'gemini-3-pro-preview'

export async function suggestReference(
  ligne: LigneFacture,
  catalogue: CatalogueComposant[],
): Promise<ReferenceSuggestion> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) throw new Error('GEMINI_API_KEY manquant')
  const ai = new GoogleGenAI({ apiKey })

  // Pour ne pas exploser le contexte, on tronque le catalogue à 200 entrées
  // les plus pertinentes (matching simpliste sur les mots-clés). En pratique
  // CAD42 a < 200 composants, donc on envoie tout.
  const trimmed = catalogue.slice(0, 300).map((c) => ({
    id: c.id,
    nom: c.nom,
    reference: c.reference,
    famille: c.famille,
  }))

  const userPayload = {
    ligne: {
      texte: ligne.ligne,
      ref_detectee: ligne.ref_detectee,
      fournisseur: ligne.fournisseur,
      prix_ht_unitaire: ligne.prix_ht_unitaire,
      lot_size: ligne.lot_size ?? null,
      lot_source: ligne.lot_source ?? null,
    },
    catalogue: trimmed,
  }

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: PROMPT },
          { text: '\n\nINPUT:\n' + JSON.stringify(userPayload, null, 2) },
        ],
      },
    ],
  })

  const text = response.text ?? ''
  const cleaned = text.replace(/```json\n?/g, '').replace(/```/g, '').trim()
  const parsed = JSON.parse(cleaned) as ReferenceSuggestion

  // Garde-fous: jamais de champ vide à la sortie.
  if (!parsed.suggested_nom || !parsed.suggested_nom.trim()) {
    parsed.suggested_nom = ligne.ligne.slice(0, 80).trim() || 'Composant à renseigner'
  }
  if (!parsed.suggested_famille) parsed.suggested_famille = 'Autre'
  if (!parsed.suggested_description) parsed.suggested_description = ligne.ligne.slice(0, 200)
  if (parsed.existing_match_id === '') parsed.existing_match_id = null

  return parsed
}
