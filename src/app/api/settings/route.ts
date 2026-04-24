import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/server'
import { invalidateSettingCache } from '@/lib/factures/settings'

// Clés supportées. Les clés flaggées secret sont masquées dans les GET.
const ALLOWED_KEYS: Record<
  string,
  { secret: boolean; envVar?: string; label?: string }
> = {
  gemini_api_key: { secret: true, envVar: 'GEMINI_API_KEY', label: 'Clé API Gemini' },
  outlook_tenant_id: { secret: false, envVar: 'OUTLOOK_TENANT_ID', label: 'Tenant ID' },
  outlook_client_id: { secret: false, envVar: 'OUTLOOK_CLIENT_ID', label: 'Client ID' },
  outlook_client_secret: { secret: true, envVar: 'OUTLOOK_CLIENT_SECRET', label: 'Client Secret' },
  outlook_mailbox: { secret: false, envVar: 'OUTLOOK_MAILBOX', label: 'Boîte mail' },
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
    label: string | null
    source: 'env' | 'db' | 'none'
    masked: string | null
    value: string | null
    set: boolean
    updated_at: string | null
  }> = []

  for (const [key, meta] of Object.entries(ALLOWED_KEYS)) {
    const envVal = meta.envVar ? process.env[meta.envVar] : undefined
    const dbRec = byKey.get(key)
    let source: 'env' | 'db' | 'none' = 'none'
    let masked: string | null = null
    let value: string | null = null
    let set = false
    if (envVal) {
      source = 'env'
      masked = meta.secret ? maskSecret(envVal) : envVal
      // Pour un non-secret venant d'env, on peut renvoyer la valeur telle quelle
      value = meta.secret ? null : envVal
      set = true
    } else if (dbRec?.value) {
      source = 'db'
      masked = meta.secret ? maskSecret(dbRec.value) : dbRec.value
      value = meta.secret ? null : dbRec.value
      set = true
    }
    out.push({
      key,
      label: meta.label ?? null,
      source,
      masked,
      value,
      set,
      updated_at: dbRec?.updated_at ?? null,
    })
  }

  return NextResponse.json({ settings: out })
}

type UpdateEntry = { key?: string; value?: string | null }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as
    | UpdateEntry
    | { updates?: UpdateEntry[] }
    | null

  // Accepte soit { key, value } (simple) soit { updates: [...] } (batch).
  const updates: UpdateEntry[] = Array.isArray((body as { updates?: UpdateEntry[] })?.updates)
    ? (body as { updates: UpdateEntry[] }).updates
    : body && 'key' in (body as UpdateEntry)
      ? [body as UpdateEntry]
      : []

  if (!updates.length) {
    return NextResponse.json({ error: 'Aucune mise à jour fournie' }, { status: 400 })
  }

  for (const u of updates) {
    if (!u.key || !(u.key in ALLOWED_KEYS)) {
      return NextResponse.json({ error: `Clé inconnue: ${u.key}` }, { status: 400 })
    }
  }

  const sb = createSupabaseAdmin()
  const results: Array<{ key: string; deleted?: boolean; ok: true }> = []

  for (const u of updates) {
    const key = u.key!
    const value = typeof u.value === 'string' ? u.value.trim() : null

    if (!value) {
      const { error } = await sb.from('app_settings').delete().eq('key', key)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      invalidateSettingCache(key)
      results.push({ key, deleted: true, ok: true })
    } else {
      const { error } = await sb
        .from('app_settings')
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      invalidateSettingCache(key)
      results.push({ key, ok: true })
    }
  }

  return NextResponse.json({ ok: true, results })
}
