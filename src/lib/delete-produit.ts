import { createSupabaseClient } from '@/lib/supabase/client'

// Suppression d'un produit avec analyse d'impact préalable.
// - Utilisé comme composant dans une BOM → suppression bloquée (FK RESTRICT).
// - Historique (mouvements, lignes de facture, fabrications) → conservé mais
//   détaché du produit (les FK sans ON DELETE bloqueraient sinon).
// - Substituts, références fournisseurs et sa propre BOM (produit fini)
//   partent en cascade.

export interface DeleteImpact {
  // BOM où le produit est utilisé comme composant — bloquant
  usedInBoms: number
  // Sa propre nomenclature (produit fini) — supprimée en cascade
  ownBomLines: number
  mouvements: number
  validations: number
  fabrications: number
}

export async function getDeleteImpact(produitId: string): Promise<DeleteImpact> {
  const sb = createSupabaseClient()
  const [bomRes, ownBomRes, mouvRes, valRes, fabRes] = await Promise.all([
    sb.from('nomenclatures').select('id', { count: 'exact', head: true }).eq('composant_id', produitId),
    sb.from('nomenclatures').select('id', { count: 'exact', head: true }).eq('produit_assemble_id', produitId),
    sb.from('mouvements').select('id', { count: 'exact', head: true }).eq('produit_id', produitId),
    sb.from('file_validation').select('id', { count: 'exact', head: true }).eq('produit_suggere_id', produitId),
    sb.from('fabrication_history').select('id', { count: 'exact', head: true }).eq('produit_id', produitId),
  ])
  return {
    usedInBoms: bomRes.count ?? 0,
    ownBomLines: ownBomRes.count ?? 0,
    mouvements: mouvRes.count ?? 0,
    validations: valRes.count ?? 0,
    fabrications: fabRes.count ?? 0,
  }
}

// Détache l'historique puis supprime le produit. Lance une erreur si la
// suppression échoue (ex. utilisé dans une BOM).
export async function deleteProduitWithDetach(produitId: string, impact: DeleteImpact): Promise<void> {
  const sb = createSupabaseClient()
  if (impact.mouvements > 0) {
    await sb.from('mouvements').update({ produit_id: null }).eq('produit_id', produitId)
  }
  if (impact.validations > 0) {
    await sb.from('file_validation').update({ produit_suggere_id: null }).eq('produit_suggere_id', produitId)
  }
  if (impact.fabrications > 0) {
    await sb.from('fabrication_history').update({ produit_id: null }).eq('produit_id', produitId)
  }
  const { error } = await sb.from('produits').delete().eq('id', produitId)
  if (error) throw new Error(error.message)
}
