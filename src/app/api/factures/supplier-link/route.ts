import { NextRequest, NextResponse } from 'next/server'
import { findSupplierLink } from '@/lib/factures/supplier-link'
import { createSupabaseAdmin } from '@/lib/supabase/server'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { nom?: string; prix?: number | null; fournisseur?: string | null; produit_id?: string; reference?: string }
    | null
  if (!body?.nom) {
    return NextResponse.json({ error: 'nom requis' }, { status: 400 })
  }

  let match
  try {
    match = await findSupplierLink({
      nom: body.nom,
      prix: body.prix ?? null,
      fournisseur: body.fournisseur ?? null,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }

  if (!match) return NextResponse.json({ match: null })

  // Persistance: seulement pour les matchs concrets (page produit identifiée),
  // pas pour les liens de recherche — sinon on enregistrerait du bruit.
  const persistable = match.source === 'amazon' && match.confiance !== 'recherche'
  if (persistable && body.produit_id && body.reference) {
    const sb = createSupabaseAdmin()
    await sb
      .from('references_fournisseurs')
      .update({ lien_url: match.url, lien_verifie_le: new Date().toISOString() })
      .eq('produit_id', body.produit_id)
      .eq('reference', body.reference)
  }

  return NextResponse.json({ match, persisted: persistable })
}
