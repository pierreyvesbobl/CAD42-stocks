import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const refFacture = req.nextUrl.searchParams.get('ref')
  const storagePathParam = req.nextUrl.searchParams.get('storagePath')

  if (!refFacture && !storagePathParam) {
    return NextResponse.json({ error: 'Missing ref or storagePath' }, { status: 400 })
  }

  const sb = createSupabaseAdmin()

  let storagePath = storagePathParam ?? null

  // Si on a une ref de facture, on retrouve d'abord le storage_path. On regarde
  // file_validation puis factures_imports (pour couvrir les factures rejetées
  // qui n'ont pas de ligne file_validation).
  if (!storagePath && refFacture) {
    const { data: row } = await sb
      .from('file_validation')
      .select('pdf_storage_path')
      .eq('ref_facture', refFacture)
      .not('pdf_storage_path', 'is', null)
      .limit(1)
      .maybeSingle()
    if (row?.pdf_storage_path) {
      storagePath = row.pdf_storage_path
    } else {
      const { data: imp } = await sb
        .from('factures_imports')
        .select('pdf_storage_path')
        .eq('ref_facture', refFacture)
        .not('pdf_storage_path', 'is', null)
        .limit(1)
        .maybeSingle()
      if (imp?.pdf_storage_path) storagePath = imp.pdf_storage_path
    }
  }

  if (!storagePath) {
    return NextResponse.json({ error: 'PDF not found' }, { status: 404 })
  }

  const { data: signed, error } = await sb.storage
    .from('factures')
    .createSignedUrl(storagePath, 3600)

  if (error || !signed) {
    return NextResponse.json({ error: 'Could not sign URL' }, { status: 500 })
  }

  return NextResponse.json({ url: signed.signedUrl })
}
