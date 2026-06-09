// Helpers de suivi de prix et de calcul de coût BOM.
//
// « Sans prix » = prix_ht null ou <= 0 (le défaut DB est 0, jamais null en
// pratique, mais on couvre les deux).

export function hasPrix(prix: number | null | undefined): boolean {
  return prix != null && prix > 0
}

/** Lignes telles que renvoyées par resolve_bom (sous-ensemble des colonnes utiles ici). */
export interface BomCostRow {
  quantite_necessaire: number
  kind?: string
  prix_ht?: number | null
}

export interface BomCost {
  cout: number          // somme prix_ht × quantité sur les composants chiffrés
  complet: boolean      // true si tous les composants ont un prix
  nbSansPrix: number    // nombre de composants sans prix
}

/**
 * Coût d'un produit fini à partir de sa nomenclature explosée (resolve_bom en
 * mode doc, p_stock_aware=false → descente jusqu'aux feuilles, cascade gratuite).
 */
export function computeBomCost(rows: BomCostRow[]): BomCost {
  let cout = 0
  let nbSansPrix = 0
  for (const r of rows) {
    if (hasPrix(r.prix_ht)) {
      cout += (r.prix_ht as number) * r.quantite_necessaire
    } else {
      nbSansPrix++
    }
  }
  return { cout, complet: nbSansPrix === 0, nbSansPrix }
}

export type PrixTrendDir = 'up' | 'down' | 'flat' | null

/** Sens d'évolution du prix vs le prix précédent. null = pas d'historique. */
export function prixTrend(
  actuel: number | null | undefined,
  precedent: number | null | undefined,
): PrixTrendDir {
  if (precedent == null || actuel == null) return null
  if (actuel > precedent) return 'up'
  if (actuel < precedent) return 'down'
  return 'flat'
}
