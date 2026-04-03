import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  if (req.headers.get('x-webhook-secret') !== process.env.N8N_WEBHOOK_SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = createSupabaseAdmin()
  const body = await req.json()
  const { error } = await sb.from('file_validation').insert(body)

  return error
    ? NextResponse.json({ error }, { status: 500 })
    : NextResponse.json({ success: true })
}
