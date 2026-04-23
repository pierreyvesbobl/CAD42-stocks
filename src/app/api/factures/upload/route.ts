import { NextRequest, NextResponse } from 'next/server'
import { processFacturePdf } from '@/lib/factures/process'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Fichier manquant (champ "file")' }, { status: 400 })
  }
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Le fichier doit être un PDF' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    const res = await processFacturePdf(buffer, file.name, { source: 'upload' })
    return NextResponse.json(res)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
