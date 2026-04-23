import { createHash } from 'node:crypto'
import { createSupabaseAdmin } from '@/lib/supabase/server'
import { analyzeFacture } from './gemini'
import { matchLigne, type CatalogueEntry } from './matcher'

export type ProcessMeta = {
  source: 'outlook' | 'upload'
  outlookMessageId?: string
  outlookAttachmentId?: string
}

export type ProcessResult =
  | {
      skipped: true
      reason: 'already_imported'
      fileName: string
      existingStoragePath: string
      existingRefFacture: string | null
      existingImportedAt: string
    }
  | {
      skipped: false
      rejected: true
      fileName: string
      storagePath: string
      categorie: string
      raison: string | null
    }
  | {
      skipped: false
      rejected: false
      fileName: string
      storagePath: string
      lignesInserted: number
      refFacture: string | null
      fournisseur: string | null
      categorie: string
    }

function hashPdf(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

export async function processFacturePdf(
  pdf: Buffer,
  fileName: string,
  meta: ProcessMeta,
): Promise<ProcessResult> {
  const sb = createSupabaseAdmin()
  const pdfHash = hashPdf(pdf)

  // Dedup: si ce PDF (par hash) a déjà été importé, on skip.
  const { data: existing } = await sb
    .from('factures_imports')
    .select('pdf_storage_path, ref_facture, imported_at')
    .eq('pdf_hash', pdfHash)
    .maybeSingle()

  if (existing) {
    return {
      skipped: true,
      reason: 'already_imported',
      fileName,
      existingStoragePath: existing.pdf_storage_path,
      existingRefFacture: existing.ref_facture,
      existingImportedAt: existing.imported_at,
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const storagePath = `${timestamp}_${fileName}`

  const { error: uploadError } = await sb.storage
    .from('factures')
    .upload(storagePath, pdf, { contentType: 'application/pdf', upsert: false })
  if (uploadError) throw new Error(`Upload Storage: ${uploadError.message}`)

  const analysis = await analyzeFacture(pdf)

  // Branche rejet: facture non-stockable. On enregistre le record d'import
  // avec statut='rejete' et on n'insère rien dans file_validation.
  if (!analysis.has_stockable_products) {
    const { error: importErr } = await sb.from('factures_imports').insert({
      source: meta.source,
      pdf_hash: pdfHash,
      outlook_message_id: meta.outlookMessageId ?? null,
      outlook_attachment_id: meta.outlookAttachmentId ?? null,
      file_name: fileName,
      pdf_storage_path: storagePath,
      ref_facture: null,
      fournisseur: analysis.lignes[0]?.fournisseur ?? null,
      date_facture: analysis.lignes[0]?.date_facture ?? null,
      lignes_count: 0,
      statut_import: 'rejete',
      categorie: analysis.categorie,
      raison_rejet: analysis.raison ?? 'Pas de produits stockables détectés',
    })
    if (importErr && !importErr.message.includes('duplicate key')) {
      throw new Error(`Insert factures_imports: ${importErr.message}`)
    }
    return {
      skipped: false,
      rejected: true,
      fileName,
      storagePath,
      categorie: analysis.categorie,
      raison: analysis.raison,
    }
  }

  // Branche normale: extraction + matching + insertion file_validation
  const { data: catalogueData, error: catErr } = await sb
    .from('references_fournisseurs')
    .select('produit_id, reference, fournisseur')
  if (catErr) throw new Error(`Catalogue: ${catErr.message}`)
  const catalogue = (catalogueData ?? []) as CatalogueEntry[]

  const rows = analysis.lignes.map(l => {
    const m = matchLigne(l.ref_detectee, l.ligne, catalogue)
    return {
      ligne: l.ligne,
      ref_detectee: l.ref_detectee,
      quantite: l.quantite,
      prix_ht_unitaire: l.prix_ht_unitaire,
      fournisseur: l.fournisseur,
      ref_facture: l.ref_facture,
      date_facture: l.date_facture,
      confiance_ia: m.confiance,
      produit_suggere_id: m.id,
      statut: 'À valider',
      pdf_storage_path: storagePath,
    }
  })

  // Cas limite: has_stockable_products=true mais lignes vides (Gemini indécis).
  // On pose un placeholder pour ne pas perdre la facture.
  if (rows.length === 0) {
    rows.push({
      ligne: '(Aucune ligne extraite — classification stockable mais extraction vide)',
      ref_detectee: null,
      quantite: null,
      prix_ht_unitaire: null,
      fournisseur: null,
      ref_facture: fileName.replace(/\.pdf$/i, ''),
      date_facture: null,
      confiance_ia: 'Inconnu',
      produit_suggere_id: null,
      statut: 'À valider',
      pdf_storage_path: storagePath,
    })
  }

  const refFacture = rows[0].ref_facture
  const fournisseur = rows[0].fournisseur
  const dateFacture = rows[0].date_facture

  const { error: insertError } = await sb.from('file_validation').insert(rows)
  if (insertError) throw new Error(`Insert file_validation: ${insertError.message}`)

  const { error: importErr } = await sb.from('factures_imports').insert({
    source: meta.source,
    pdf_hash: pdfHash,
    outlook_message_id: meta.outlookMessageId ?? null,
    outlook_attachment_id: meta.outlookAttachmentId ?? null,
    file_name: fileName,
    pdf_storage_path: storagePath,
    ref_facture: refFacture,
    fournisseur,
    date_facture: dateFacture,
    lignes_count: rows.length,
    statut_import: 'accepte',
    categorie: analysis.categorie,
    raison_rejet: null,
  })
  if (importErr && !importErr.message.includes('duplicate key')) {
    throw new Error(`Insert factures_imports: ${importErr.message}`)
  }

  return {
    skipped: false,
    rejected: false,
    fileName,
    storagePath,
    lignesInserted: rows.length,
    refFacture,
    fournisseur,
    categorie: analysis.categorie,
  }
}
