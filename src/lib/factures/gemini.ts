import { GoogleGenAI } from '@google/genai'

export type LigneFacture = {
  ligne: string
  ref_detectee: string | null
  quantite: number | null
  prix_ht_unitaire: number | null
  fournisseur: string | null
  ref_facture: string | null
  date_facture: string | null
  lot_size?: number | null
  lot_source?: string | null
}

export type FactureCategorie =
  | 'electronic_components'
  | 'physical_products'
  | 'service'
  | 'subscription'
  | 'insurance'
  | 'fee'
  | 'other'

export type FactureAnalysis = {
  has_stockable_products: boolean
  categorie: FactureCategorie
  raison: string | null // courte justification de la classification
  lignes: LigneFacture[] // vide si has_stockable_products=false
}

const PROMPT = `Tu es un assistant spécialisé dans l'extraction et la classification de factures
fournisseurs pour CAD 42x, une entreprise de matériel électronique (RTK, kits
capteurs, composants).

ÉTAPE 1 — CLASSIFICATION
Décide si cette facture concerne des PRODUITS PHYSIQUES STOCKABLES (composants,
équipements, matériel, accessoires) ou non (services, abonnements logiciels,
prévoyance, assurance, frais bancaires, prestations intellectuelles, loyers...).

ÉTAPE 2 — EXTRACTION (uniquement si has_stockable_products = true)
Extrais CHAQUE ligne article physique. Si has_stockable_products = false,
renvoie lignes: [].

ÉTAPE 3 — RÉSOLUTION DES LOTS / CONDITIONNEMENTS (TRÈS IMPORTANT)
Si une ligne décrit un conditionnement par lot ("lot de N", "pack de N",
"boîte de N", "sachet de N", "carton de N", "x N pcs", "N pces/lot"), tu dois
interpréter le produit comme N UNITÉS du composant unitaire et NON comme
"1 unité de lot".

Algorithme:
- lot_size = nombre d'unités contenues dans un lot (ex. "lot de 5" → 5)
- n_lots  = nombre de lots achetés sur la facture (la quantité affichée)
- quantite = lot_size × n_lots
- prix_ht_unitaire = prix unitaire de UN composant individuel
  (= prix du lot / lot_size). Reste à 2 décimales.
- ref_detectee = référence du COMPOSANT unitaire (pas du lot)
- ligne = description NORMALISÉE du composant unitaire, suivie entre parenthèses
  de la mention du conditionnement source (ex: "Boulon M4 inox tête fraisée
  (issu de lot de 5)").

Si le lot_size ne peut pas être déterminé avec certitude, ne tente pas la
décomposition: garde la ligne telle quelle et mets le détail brut dans "ligne".

Retourne UNIQUEMENT un JSON valide, sans markdown, sans commentaire, avec ce format:
{
  "has_stockable_products": true | false,
  "categorie": "electronic_components" | "physical_products" | "service" | "subscription" | "insurance" | "fee" | "other",
  "raison": "courte justification (max 100 caractères)",
  "lignes": [
    {
      "ligne": "description finale (du composant unitaire si lot)",
      "ref_detectee": "référence article unitaire",
      "quantite": 1,
      "prix_ht_unitaire": 0.00,
      "fournisseur": "nom du fournisseur (en-tête de la facture)",
      "ref_facture": "numéro de facture",
      "date_facture": "YYYY-MM-DD",
      "lot_size": null,
      "lot_source": null
    }
  ]
}

Règles sur les lignes :
- quantite et prix_ht_unitaire sont des nombres, pas des strings
- quantite est TOUJOURS la quantité en unités de composant (jamais en lots)
- date_facture est au format YYYY-MM-DD
- fournisseur et ref_facture sont les mêmes pour toutes les lignes d'une même facture
- N'inclus PAS les lignes de TVA, total, frais de port ou sous-totaux
- N'inclus que les lignes correspondant à des articles/produits physiques
- Si une référence article est ambiguë, garde la description complète dans ref_detectee
- Si un champ est illisible, mets null plutôt qu'inventer
- lot_size = N si un lot a été décomposé, sinon null
- lot_source = "lot de 5", "pack de 10", etc. tel que lu sur la facture, sinon null`

const MODEL = 'gemini-3-pro-preview'

export async function analyzeFacture(pdf: Buffer): Promise<FactureAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) throw new Error('GEMINI_API_KEY manquant')
  const ai = new GoogleGenAI({ apiKey })

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: pdf.toString('base64') } },
          { text: PROMPT },
        ],
      },
    ],
  })

  const text = response.text ?? ''
  const cleaned = text.replace(/```json\n?/g, '').replace(/```/g, '').trim()

  const parsed = JSON.parse(cleaned)
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray(parsed.lignes)) {
    throw new Error("Gemini: réponse malformée (attendu objet avec 'lignes' array)")
  }
  return parsed as FactureAnalysis
}
