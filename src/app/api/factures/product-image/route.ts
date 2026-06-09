import { NextRequest, NextResponse } from 'next/server'
import { extractProductImage } from '@/lib/factures/product-image'
import { createSupabaseAdmin } from '@/lib/supabase/server'

export const maxDuration = 30

// Génère la miniature produit à partir d'une URL de page fournisseur et la
// persiste sur produits.image_url (une image principale par produit).
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { produit_id?: string; url?: string }
    | null
  if (!body?.url || !body?.produit_id) {
    return NextResponse.json({ error: 'produit_id et url requis' }, { status: 400 })
  }

  let image_url: string | null
  try {
    image_url = await extractProductImage(body.url)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }

  if (!image_url) return NextResponse.json({ image_url: null })

  const sb = createSupabaseAdmin()
  const { error } = await sb
    .from('produits')
    .update({ image_url, image_maj_le: new Date().toISOString() })
    .eq('id', body.produit_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ image_url })
}
