import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const refFacture = req.nextUrl.searchParams.get('ref')
  if (!refFacture) {
    return NextResponse.json({ error: 'Missing ref' }, { status: 400 })
  }

  const sb = createSupabaseAdmin()

  const { data: row } = await sb
    .from('file_validation')
    .select('pdf_storage_path')
    .eq('ref_facture', refFacture)
    .not('pdf_storage_path', 'is', null)
    .limit(1)
    .single()

  if (!row?.pdf_storage_path) {
    return NextResponse.json({ error: 'PDF not found' }, { status: 404 })
  }

  const { data: signed, error } = await sb.storage
    .from('factures')
    .createSignedUrl(row.pdf_storage_path, 3600)

  if (error || !signed) {
    return NextResponse.json({ error: 'Could not sign URL' }, { status: 500 })
  }

  return NextResponse.json({ url: signed.signedUrl })
}
