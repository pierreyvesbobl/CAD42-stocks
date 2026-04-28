import { createSupabaseClient } from './supabase/client'

export async function getDefaultSeuilAlerte(): Promise<number> {
  const sb = createSupabaseClient()
  const { data } = await sb
    .from('app_settings_public')
    .select('value')
    .eq('key', 'default_seuil_alerte')
    .maybeSingle()
  const n = parseInt(data?.value ?? '', 10)
  return Number.isFinite(n) ? n : 0
}
