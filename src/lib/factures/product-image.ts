// Extraction best-effort d'une miniature produit à partir d'une URL de page
// fournisseur (Amazon, Mouser, etc.). On lit la balise Open Graph og:image
// (présente sur la plupart des sites e-commerce), avec quelques replis.
//
// Volontairement sans dépendance HTML : parsing par regex, cohérent avec
// supplier-link.ts. On renvoie l'URL absolue de l'image, ou null.

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

// Cherche un attribut content/href dans une balise meta/link quel que soit
// l'ordre des attributs (property avant ou après content).
function metaContent(html: string, attr: string, value: string): string | null {
  const v = value.replace(/[:]/g, '\\:')
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${v}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${v}["']`, 'i'),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return m[1]
  }
  return null
}

// Amazon n'expose pas d'og:image sur ses fiches produit : l'image principale
// vit dans le bloc image (data-old-hires, hiRes, ou data-a-dynamic-image dont
// les clés sont des URLs). Patterns ciblés sur le CDN media-amazon.
function amazonImage(html: string): string | null {
  const old = html.match(/data-old-hires=["'](https:[^"']+)["']/i)?.[1]
  if (old) return old
  const hi = html.match(/"hiRes":"(https:[^"]+)"/)?.[1]
  if (hi) return hi.replace(/\\u002F/g, '/')
  const dyn =
    html.match(/id="landingImage"[^>]*data-a-dynamic-image=["']([^"']+)["']/i)?.[1] ??
    html.match(/data-a-dynamic-image=["']([^"']+)["'][^>]*id="landingImage"/i)?.[1]
  if (dyn) {
    const first = decodeEntities(dyn).match(/https:[^"\\]+/)?.[0]
    if (first) return first
  }
  return html.match(/"large":"(https:[^"]+)"/)?.[1]?.replace(/\\u002F/g, '/') ?? null
}

export async function extractProductImage(url: string): Promise<string | null> {
  if (!/^https?:\/\//i.test(url)) return null
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
    if (!res.ok) return null
    html = await res.text()
  } catch {
    return null
  }

  // Page bot / captcha Amazon : pas d'image fiable.
  if (/api-services-support@amazon|enter the characters you see/i.test(html)) {
    return null
  }

  const raw =
    metaContent(html, 'property', 'og:image:secure_url') ??
    metaContent(html, 'property', 'og:image') ??
    metaContent(html, 'name', 'og:image') ??
    metaContent(html, 'name', 'twitter:image') ??
    metaContent(html, 'name', 'twitter:image:src') ??
    html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i)?.[1] ??
    amazonImage(html) ??
    null

  if (!raw) return null

  // Résolution des URLs relatives + validation http(s).
  try {
    const abs = new URL(decodeEntities(raw), url).href
    return /^https?:\/\//i.test(abs) ? abs : null
  } catch {
    return null
  }
}
