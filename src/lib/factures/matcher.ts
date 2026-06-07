// Fuzzy matching lignes facture → catalogue references_fournisseurs.
// Porté du workflow n8n [CAD42] Validation Factures.

export type CatalogueEntry = {
  produit_id: string
  reference: string
  fournisseur: string | null
}

export type Confiance = 'Connu' | 'Similaire' | 'Inconnu'

export type MatchResult = {
  id: string | null
  confiance: Confiance
}

function normalize(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[àâä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[îï]/g, 'i')
    .replace(/[ôö]/g, 'o')
    .replace(/[ùûü]/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(s: string | null | undefined): string[] {
  return normalize(s).split(' ').filter(t => t.length > 1)
}

function bigrams(s: string | null | undefined): string[] {
  const n = normalize(s).replace(/ /g, '')
  const b: string[] = []
  for (let i = 0; i < n.length - 1; i++) b.push(n.slice(i, i + 2))
  return b
}

function bigramSimilarity(a: string, b: string): number {
  const ba = bigrams(a)
  const bb = bigrams(b)
  if (!ba.length || !bb.length) return 0
  const setB = new Set(bb)
  let common = 0
  for (const g of ba) if (setB.has(g)) common++
  return (2 * common) / (ba.length + bb.length)
}

function tokenOverlap(a: string, b: string): number {
  const ta = tokenize(a)
  const tb = tokenize(b)
  if (!ta.length || !tb.length) return 0
  let matches = 0
  for (const t of ta) {
    for (const u of tb) {
      if (t === u || (t.length >= 3 && u.length >= 3 && (u.includes(t) || t.includes(u)))) {
        matches++
        break
      }
    }
  }
  return matches / Math.min(ta.length, tb.length)
}

function extractNumbers(s: string): string[] {
  return (s.match(/\d+/g) || []).filter(n => n.length >= 2)
}

function numberMatch(a: string, b: string): number {
  const na = extractNumbers(a)
  const nb = extractNumbers(b)
  if (!na.length || !nb.length) return 0
  let common = 0
  for (const n of na) if (nb.includes(n)) common++
  return common / Math.max(na.length, nb.length)
}

function score(ref: string, cat: string): number {
  const na = normalize(ref)
  const nb = normalize(cat)
  if (na === nb) return 1
  if (nb.includes(na) || na.includes(nb)) return 0.9
  const bg = bigramSimilarity(ref, cat)
  const tk = tokenOverlap(ref, cat)
  const nm = numberMatch(ref, cat)
  return bg * 0.35 + tk * 0.45 + nm * 0.2
}

export function matchLigne(
  refDetectee: string | null | undefined,
  ligne: string | null | undefined,
  catalogue: CatalogueEntry[],
): MatchResult {
  if (!refDetectee && !ligne) return { id: null, confiance: 'Inconnu' }

  let best: CatalogueEntry | null = null
  let bestScore = 0
  // Produits distincts au niveau du meilleur score — une réf fournisseur peut
  // être partagée par plusieurs composants (ex. assortiment de passe-câbles
  // éclaté par diamètre).
  let topProduits = new Set<string>()

  if (refDetectee) {
    for (const p of catalogue) {
      const s = score(refDetectee, p.reference)
      if (s > bestScore) {
        bestScore = s
        best = p
        topProduits = new Set([p.produit_id])
      } else if (s === bestScore && s > 0) {
        topProduits.add(p.produit_id)
      }
    }
  }

  if (bestScore < 0.35 && ligne) {
    for (const p of catalogue) {
      const s = score(ligne, p.reference)
      if (s > bestScore) {
        bestScore = s
        best = p
        topProduits = new Set([p.produit_id])
      } else if (s === bestScore && s > 0) {
        topProduits.add(p.produit_id)
      }
    }
  }

  if (best && bestScore >= 0.85) {
    // Réf partagée entre plusieurs produits → on ne tranche pas à leur place :
    // confiance 'Similaire' pour forcer la validation humaine (la ligne peut
    // être dupliquée pour ventiler les quantités entre les variantes).
    if (topProduits.size > 1) return { id: best.produit_id, confiance: 'Similaire' }
    return { id: best.produit_id, confiance: 'Connu' }
  }
  if (best && bestScore >= 0.35) return { id: best.produit_id, confiance: 'Similaire' }
  return { id: null, confiance: 'Inconnu' }
}
