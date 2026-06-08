import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Normalise une chaîne pour la recherche : minuscules + suppression des
// accents (« câble » matche « cable », « anémomètre » matche « anemometre »).
export function normSearch(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

// Parse un nombre saisi avec virgule ou point d\u00e9cimal (ex. \u00ab 1,5 \u00bb \u2192 1.5),
// pour les quantit\u00e9s au m\u00e8tre/litre. Retourne `fallback` si invalide.
export function parseDecimal(s: string, fallback = 0): number {
  const n = parseFloat((s ?? '').replace(',', '.').trim())
  return isNaN(n) ? fallback : n
}

// Formate une quantit\u00e9 : entier sans d\u00e9cimale, sinon virgule FR (1.5 \u2192 \u00ab 1,5 \u00bb).
export function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',')
}
