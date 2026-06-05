import { createSupabaseClient } from '@/lib/supabase/client'

// Duplique un produit (fiche uniquement : nom « (copie) », stock à 0) et, en
// option, sa nomenclature. Les mouvements et refs fournisseurs ne sont pas
// copiés — le but est d'éditer une variante à la marge.
export async function duplicateProduit(
  produitId: string,
  opts: { withBom?: boolean } = {},
): Promise<{ id: string; reference: string; nom: string }> {
  const sb = createSupabaseClient()

  const { data: src, error } = await sb
    .from('produits')
    .select('nom, famille, statut, prix_ht, seuil_alerte, description')
    .eq('id', produitId)
    .single()
  if (error || !src) throw new Error(error?.message ?? 'Produit introuvable')

  const { data: refData } = await sb.rpc('next_internal_ref')
  const reference = (refData as string) ?? `CAD-${Date.now()}`

  const { data: created, error: insErr } = await sb
    .from('produits')
    .insert({
      reference,
      nom: `${src.nom} (copie)`,
      famille: src.famille,
      statut: src.statut,
      prix_ht: src.prix_ht,
      seuil_alerte: src.seuil_alerte,
      stock_actuel: 0,
      description: src.description,
    })
    .select('id, reference, nom')
    .single()
  if (insErr || !created) throw new Error(insErr?.message ?? 'Création impossible')

  if (opts.withBom) {
    const { data: lignes } = await sb
      .from('nomenclatures')
      .select('composant_id, quantite')
      .eq('produit_assemble_id', produitId)
    if (lignes && lignes.length > 0) {
      await sb.from('nomenclatures').insert(
        lignes.map((l) => ({
          produit_assemble_id: created.id,
          composant_id: l.composant_id,
          quantite: l.quantite,
        })),
      )
    }
  }

  return created as { id: string; reference: string; nom: string }
}
