import { createSupabaseAdmin } from '@/lib/supabase/server'

// Cache simple par process: app_settings change rarement, un TTL de 30s évite
// d'appeler Supabase à chaque PDF sans risquer de bloquer un nouveau secret
// pendant des heures.
const CACHE_TTL_MS = 30_000
const cache = new Map<string, { value: string | null; expires: number }>()

export async function resolveSetting(
  key: string,
  envVar?: string,
): Promise<string | null> {
  if (envVar) {
    const v = process.env[envVar]
    if (v) return v
  }

  const cached = cache.get(key)
  if (cached && cached.expires > Date.now()) return cached.value

  const sb = createSupabaseAdmin()
  const { data } = await sb
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()

  const value = data?.value ?? null
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS })
  return value
}

export function invalidateSettingCache(key?: string) {
  if (key) cache.delete(key)
  else cache.clear()
}

export async function requireSetting(key: string, envVar?: string, label?: string): Promise<string> {
  const v = await resolveSetting(key, envVar)
  if (!v) {
    const name = label ?? key
    throw new Error(`${name} manquant (ni dans env ni dans app_settings)`)
  }
  return v
}
