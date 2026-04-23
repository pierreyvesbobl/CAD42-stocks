import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { createSupabaseAdmin } from '@/lib/supabase/server'

export const maxDuration = 300

// POST /api/factures/cleanup-duplicates?dryRun=1
//
// Nettoie les doublons créés avant la mise en place de la dedup.
// Stratégie: regrouper par nom de fichier original (partie après le timestamp
// prefix dans pdf_storage_path). Un même PDF réimporté plusieurs fois aura
// le même nom de fichier original mais des timestamps différents.
// On garde le plus récent (timestamp le plus grand).
//
// - Supprime les lignes file_validation des autres chemins
// - Supprime les fichiers Storage correspondants
// - Backfill factures_imports avec (pdf_hash, ref_facture, storage_path)
//   pour chaque chemin gardé (hash calculé en retéléchargeant le PDF).
//
// dryRun=1 → liste ce qui serait fait, sans rien modifier.

function originalFileName(storagePath: string): string {
  // format: "2026-04-23T08-42-18-412Z_FICHIER.pdf" → "FICHIER.pdf"
  const idx = storagePath.indexOf('_')
  return idx === -1 ? storagePath : storagePath.slice(idx + 1)
}

export async function POST(req: NextRequest) {
  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1'
  const sb = createSupabaseAdmin()

  const { data: rows, error } = await sb
    .from('file_validation')
    .select('pdf_storage_path')
    .not('pdf_storage_path', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Pour chaque nom de fichier original, lister les storage_path distincts
  const pathsByName = new Map<string, Set<string>>()
  for (const r of rows ?? []) {
    if (!r.pdf_storage_path) continue
    const name = originalFileName(r.pdf_storage_path)
    if (!pathsByName.has(name)) pathsByName.set(name, new Set())
    pathsByName.get(name)!.add(r.pdf_storage_path)
  }

  const groups: Array<{ fileName: string; keep: string; remove: string[] }> = []
  for (const [fileName, paths] of pathsByName) {
    if (paths.size < 2) continue
    const sorted = [...paths].sort() // timestamp prefix → ordre croissant
    const keep = sorted[sorted.length - 1] // plus récent
    const remove = sorted.slice(0, -1)
    groups.push({ fileName, keep, remove })
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      groupsCount: groups.length,
      groups,
    })
  }

  let deletedRows = 0
  let deletedFiles = 0
  let backfilled = 0
  const errors: string[] = []

  for (const g of groups) {
    // 1. supprimer lignes file_validation des chemins à retirer
    const { error: delErr, count } = await sb
      .from('file_validation')
      .delete({ count: 'exact' })
      .in('pdf_storage_path', g.remove)
    if (delErr) {
      errors.push(`${g.fileName}: delete rows: ${delErr.message}`)
    } else {
      deletedRows += count ?? 0
    }

    // 2. supprimer fichiers Storage
    const { data: rm, error: rmErr } = await sb.storage.from('factures').remove(g.remove)
    if (rmErr) {
      errors.push(`${g.fileName}: delete storage: ${rmErr.message}`)
    } else {
      deletedFiles += rm?.length ?? 0
    }
  }

  // 3. backfill factures_imports pour les chemins "keep" qui n'y sont pas encore
  const allKeep = [...new Set(groups.map(g => g.keep))]
  // Inclure aussi les storage_paths qui n'étaient pas en doublon
  for (const paths of pathsByName.values()) {
    if (paths.size === 1) allKeep.push([...paths][0])
  }
  const uniqueKeep = [...new Set(allKeep)]

  const { data: existing } = await sb
    .from('factures_imports')
    .select('pdf_storage_path')
    .in('pdf_storage_path', uniqueKeep)
  const alreadyIn = new Set((existing ?? []).map(r => r.pdf_storage_path))
  const toBackfill = uniqueKeep.filter(p => !alreadyIn.has(p))

  for (const path of toBackfill) {
    try {
      const { data: blob, error: dlErr } = await sb.storage.from('factures').download(path)
      if (dlErr || !blob) throw new Error(dlErr?.message ?? 'download empty')
      const buf = Buffer.from(await blob.arrayBuffer())
      const pdfHash = createHash('sha256').update(buf).digest('hex')

      const { data: meta } = await sb
        .from('file_validation')
        .select('ref_facture, fournisseur, date_facture')
        .eq('pdf_storage_path', path)
        .limit(1)
        .maybeSingle()

      const { count } = await sb
        .from('file_validation')
        .select('id', { count: 'exact', head: true })
        .eq('pdf_storage_path', path)

      const { error: insErr } = await sb.from('factures_imports').insert({
        source: 'upload', // historique: source inconnue, on met upload
        pdf_hash: pdfHash,
        file_name: path.replace(/^[^_]+_/, ''),
        pdf_storage_path: path,
        ref_facture: meta?.ref_facture ?? null,
        fournisseur: meta?.fournisseur ?? null,
        date_facture: meta?.date_facture ?? null,
        lignes_count: count ?? 0,
      })
      if (insErr && !insErr.message.includes('duplicate key')) {
        errors.push(`backfill ${path}: ${insErr.message}`)
      } else {
        backfilled++
      }
    } catch (err) {
      errors.push(`backfill ${path}: ${(err as Error).message}`)
    }
  }

  return NextResponse.json({
    dryRun: false,
    groupsCount: groups.length,
    deletedRows,
    deletedFiles,
    backfilled,
    errors,
  })
}
