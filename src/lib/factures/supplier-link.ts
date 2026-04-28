// Recherche d'un lien fournisseur (Amazon prioritaire) à partir d'un nom +
// prix de référence. Volontairement best-effort: parsing HTML basique, on
// renvoie un candidat seulement si titre ET prix sont raisonnablement cohérents.
//
// Fallback: si le scraping échoue (Amazon bloque, classes changées), on renvoie
// au minimum un lien vers la page de résultats Amazon pré-remplie avec le nom
// du produit. Mieux qu'un null qui empêche d'avancer.

export type SupplierMatch = {
  url: string
  title: string
  price: number | null
  source: 'amazon' | 'amazon_search' | 'generic'
  confiance: 'haute' | 'moyenne' | 'recherche'
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36'

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function normalize(s: string): string {
  return s
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

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normalize(a).split(' ').filter((t) => t.length > 2))
  const tb = new Set(normalize(b).split(' ').filter((t) => t.length > 2))
  if (ta.size === 0 || tb.size === 0) return 0
  let common = 0
  for (const t of ta) if (tb.has(t)) common++
  return common / Math.min(ta.size, tb.size)
}

function priceCoherent(target: number, candidate: number): boolean {
  if (target <= 0) return false
  const ratio = candidate / target
  // Mode large (matching manuel/exploratoire). Amazon affiche TTC, factures en
  // HT, donc une fourchette autour de [HT, HT*1.2] avec un peu de marge.
  return ratio >= 0.5 && ratio <= 2.0
}

// Mode strict pour l'import: on n'attache un lien que si le prix Amazon est
// quasi-égal au prix facture (±15%). En dessous on considère que ce n'est pas
// la même référence, peu importe la similarité du titre.
// La fenêtre couvre l'écart HT→TTC (×1.2) + petite tolérance d'arrondi.
function priceVeryClose(target: number, candidate: number): boolean {
  if (target <= 0) return false
  const ratio = candidate / target
  return ratio >= 0.85 && ratio <= 1.35
}

function amazonSearchUrl(query: string): string {
  return `https://www.amazon.fr/s?k=${encodeURIComponent(query)}`
}

async function searchAmazon(query: string): Promise<SupplierMatch[]> {
  const url = amazonSearchUrl(query)
  let html: string
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    html = await res.text()
  } catch {
    return []
  }

  // Détection captcha / page bot — dans ce cas on ne tente pas l'extraction.
  if (/api-services-support@amazon|enter the characters you see/i.test(html)) {
    return []
  }

  // On itère sur tous les ASIN trouvés. Pour chaque ASIN, on essaie plusieurs
  // patterns de titre + prix car les classes Amazon évoluent.
  const matches: SupplierMatch[] = []
  const asinRegex = /data-asin="([A-Z0-9]{10})"/g
  const seen = new Set<string>()
  let am
  while ((am = asinRegex.exec(html)) !== null && matches.length < 5) {
    const asin = am[1]
    if (!asin || seen.has(asin)) continue
    seen.add(asin)
    // Fenêtre de ~10k chars autour de l'ASIN pour récupérer le bloc card.
    const start = Math.max(0, am.index - 200)
    const block = html.slice(start, am.index + 10000)

    // Titres possibles (par ordre de robustesse): aria-label sur le lien produit,
    // h2 a span, span s-line-clamp.
    const titleMatch =
      block.match(/<a[^>]*class="[^"]*a-link-normal[^"]*s-line-clamp-[^"]*"[^>]*>\s*<span[^>]*>([^<]+)<\/span>/) ||
      block.match(/<h2[^>]*>\s*(?:<a[^>]*>\s*)?<span[^>]*>([^<]+)<\/span>/) ||
      block.match(/aria-label="([^"]+)"[^>]*class="[^"]*s-line-clamp/) ||
      block.match(/<span class="[^"]*a-text-normal[^"]*"[^>]*>([^<]+)<\/span>/)

    if (!titleMatch) continue
    const title = decodeEntities(titleMatch[1].trim())
    if (!title || title.length < 3) continue

    const priceMatch =
      block.match(/<span class="a-offscreen">\s*([\d.,]+)\s*€?\s*<\/span>/) ||
      block.match(/<span class="a-price-whole">(\d+)/)
    let price: number | null = null
    if (priceMatch) {
      const raw = priceMatch[1].replace(/[^\d,.]/g, '').replace(',', '.')
      const v = parseFloat(raw)
      if (!isNaN(v)) price = v
    }

    matches.push({
      url: `https://www.amazon.fr/dp/${asin}`,
      title,
      price,
      source: 'amazon',
      confiance: 'moyenne',
    })
  }
  return matches
}

export async function findSupplierLink(opts: {
  nom: string
  refDetectee?: string | null
  prix: number | null
  fournisseur: string | null
  // strict=true: on refuse d'inventer un lien — seulement matchs hauts.
  // strict=false (manuel): fallback "recherche Amazon" si rien de plausible.
  strict?: boolean
}): Promise<SupplierMatch | null> {
  const { nom, refDetectee, prix, strict = false } = opts
  if (!nom?.trim()) return null

  const fallback: SupplierMatch = {
    url: amazonSearchUrl(nom),
    title: `Recherche Amazon : ${nom}`,
    price: null,
    source: 'amazon_search',
    confiance: 'recherche',
  }

  let candidates: SupplierMatch[] = []
  try {
    candidates = await searchAmazon(nom)
  } catch {
    return strict ? null : fallback
  }
  if (candidates.length === 0) return strict ? null : fallback

  // Score = overlap titre × cohérence prix, avec boost si la ref_detectee
  // (souvent un SKU fournisseur) apparaît tel quel dans le titre Amazon.
  // C'est le signal le plus fiable pour s'assurer qu'on cible la même
  // référence physique et non un produit "qui ressemble".
  const refTok = (refDetectee ?? '').trim().toLowerCase()
  let best: SupplierMatch | null = null
  let bestScore = 0
  for (const c of candidates) {
    const titleLc = c.title.toLowerCase()
    const overlap = tokenOverlap(nom, c.title)
    let priceScore = 0.5
    if (c.price != null && prix != null) {
      priceScore = priceCoherent(prix, c.price) ? 1 : 0
    }
    const refBoost = refTok.length >= 4 && titleLc.includes(refTok) ? 0.3 : 0
    const score = Math.min(1, overlap * 0.55 + priceScore * 0.25 + refBoost + 0.1 * (refTok && titleLc.includes(refTok) ? 1 : 0))
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }

  // En mode strict (import auto), exigences cumulatives :
  //  1. on a un prix sur la facture ET un prix lu sur Amazon
  //  2. ces prix sont quasi-égaux (±15%, fenêtre HT→TTC)
  //  3. le titre matche raisonnablement (overlap ≥ 0.4) OU la ref_detectee
  //     est présente dans le titre Amazon
  // Sans ces 3 conditions on retourne null — pas la peine d'enregistrer un
  // lien si on n'est pas sûr que c'est la même référence physique.
  if (strict) {
    if (!best) return null
    if (best.price == null || prix == null) return null
    if (!priceVeryClose(prix, best.price)) return null
    const overlap = tokenOverlap(nom, best.title)
    const refInTitle = refTok.length >= 4 && best.title.toLowerCase().includes(refTok)
    if (overlap < 0.4 && !refInTitle) return null
    return { ...best, confiance: 'haute' }
  }

  if (best && bestScore >= 0.45) {
    return { ...best, confiance: bestScore >= 0.7 ? 'haute' : 'moyenne' }
  }
  return fallback
}
