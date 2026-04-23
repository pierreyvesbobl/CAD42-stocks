import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/server'

// Clés supportées. Les clés flaggées secret sont masquées dans les GET.
const ALLOWED_KEYS: Record<string, { secret: boolean; envVar?: string }> = {
  gemini_api_key: { secret: true, envVar: 'GEMINI_API_KEY' },
}

function maskSecret(v: string | null): string | null {
  if (!v) return null
  if (v.length <= 8) return '•'.repeat(v.length)
  return `${v.slice(0, 4)}${'•'.repeat(Math.max(v.length - 8, 8))}${v.slice(-4)}`
}

export async function GET() {
  const sb = createSupabaseAdmin()
  const { data } = await sb.from('app_settings').select('key, value, updated_at')

  const byKey = new Map<string, { value: string | null; updated_at: string | null }>()
  for (const r of data ?? []) byKey.set(r.key, { value: r.value, updated_at: r.updated_at })

  const out: Array<{
    key: string
    source: 'env' | 'db' | 'none'
    masked: string | null
    set: boolean
    updated_at: string | null
  }> = []

  for (const [key, meta] of Object.entries(ALLOWED_KEYS)) {
    const envVal = meta.envVar ? process.env[meta.envVar] : undefined
    const dbRec = byKey.get(key)
    let source: 'env' | 'db' | 'none' = 'none'
    let masked: string | null = null
    let set = false
    if (envVal) {
      source = 'env'
      masked = meta.secret ? maskSecret(envVal) : envVal
      set = true
    } else if (dbRec?.value) {
      source = 'db'
      masked = meta.secret ? maskSecret(dbRec.value) : dbRec.value
      set = true
    }
    out.push({ key, source, masked, set, updated_at: dbRec?.updated_at ?? null })
  }

  return NextResponse.json({ settings: out })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { key?: string; value?: string | null } | null
  if (!body?.key || !(body.key in ALLOWED_KEYS)) {
    return NextResponse.json({ error: 'Clé inconnue' }, { status: 400 })
  }
  const value = typeof body.value === 'string' ? body.value.trim() : null

  const sb = createSupabaseAdmin()

  if (!value) {
    // valeur vide → suppression
    const { error } = await sb.from('app_settings').delete().eq('key', body.key)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: true })
  }

  const { error } = await sb
    .from('app_settings')
    .upsert({ key: body.key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
