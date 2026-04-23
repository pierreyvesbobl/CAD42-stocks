import { GoogleGenAI } from '@google/genai'
import { createSupabaseAdmin } from '@/lib/supabase/server'

async function resolveApiKey(): Promise<string> {
  const fromEnv = process.env.GEMINI_API_KEY
  if (fromEnv) return fromEnv
  const sb = createSupabaseAdmin()
  const { data } = await sb
    .from('app_settings')
    .select('value')
    .eq('key', 'gemini_api_key')
    .maybeSingle()
  if (data?.value) return data.value
  throw new Error('GEMINI_API_KEY manquant (ni dans env ni dans app_settings)')
}

export type LigneFacture = {
  ligne: string
  ref_detectee: string | null
  quantite: number | null
  prix_ht_unitaire: number | null
  fournisseur: string | null
  ref_facture: string | null
  date_facture: string | null
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

Retourne UNIQUEMENT un JSON valide, sans markdown, sans commentaire, avec ce format:
{
  "has_stockable_products": true | false,
  "categorie": "electronic_components" | "physical_products" | "service" | "subscription" | "insurance" | "fee" | "other",
  "raison": "courte justification (max 100 caractères)",
  "lignes": [
    {
      "ligne": "texte brut de la ligne tel que lu sur la facture",
      "ref_detectee": "référence article la plus précise possible",
      "quantite": 1,
      "prix_ht_unitaire": 0.00,
      "fournisseur": "nom du fournisseur (en-tête de la facture)",
      "ref_facture": "numéro de facture",
      "date_facture": "YYYY-MM-DD"
    }
  ]
}

Règles sur les lignes :
- quantite et prix_ht_unitaire sont des nombres, pas des strings
- date_facture est au format YYYY-MM-DD
- fournisseur et ref_facture sont les mêmes pour toutes les lignes d'une même facture
- N'inclus PAS les lignes de TVA, total, frais de port ou sous-totaux
- N'inclus que les lignes correspondant à des articles/produits physiques
- Si une référence article est ambiguë, garde la description complète dans ref_detectee
- Si un champ est illisible, mets null plutôt qu'inventer`

const MODEL = 'gemini-3-pro-preview'

export async function analyzeFacture(pdf: Buffer): Promise<FactureAnalysis> {
  const apiKey = await resolveApiKey()
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
