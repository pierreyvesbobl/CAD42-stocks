import { NextRequest, NextResponse } from 'next/server'
import { fetchLatestFacturePdfs, type FetchOptions } from '@/lib/factures/outlook'
import { processFacturePdf } from '@/lib/factures/process'

export const maxDuration = 300

async function handle(req: NextRequest) {
  // Auth cron Vercel: si CRON_SECRET est défini, exiger le header correspondant.
  // Laisse passer sans header côté dev (secret vide).
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authz = req.headers.get('authorization') ?? ''
    const expected = `Bearer ${cronSecret}`
    const isCron = authz === expected
    const isInternal = req.headers.get('x-internal') === cronSecret
    if (!isCron && !isInternal && req.method === 'GET') {
      // GET est réservé au cron. Les appels UI utilisent POST.
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const url = new URL(req.url)
  const sinceHoursRaw = url.searchParams.get('sinceHours')
  const limitRaw = url.searchParams.get('limit')

  let opts: FetchOptions
  if (sinceHoursRaw) {
    const hours = Math.min(Math.max(parseFloat(sinceHoursRaw) || 24, 0.1), 24 * 30)
    const since = new Date(Date.now() - hours * 3600 * 1000)
    opts = { mode: 'since', since }
  } else {
    const limit = Math.min(Math.max(parseInt(limitRaw ?? '5', 10) || 5, 1), 25)
    opts = { mode: 'latest', limit }
  }

  let pdfs, stats
  try {
    ;({ pdfs, stats } = await fetchLatestFacturePdfs(opts))
  } catch (err) {
    return NextResponse.json(
      { error: `Outlook: ${(err as Error).message}` },
      { status: 500 },
    )
  }

  const processed: Array<{
    attachmentName: string
    messageId: string
    lignesInserted?: number
    refFacture?: string | null
    fournisseur?: string | null
    skipped?: boolean
    rejected?: boolean
    categorie?: string
    raison?: string | null
    error?: string
  }> = []

  for (const p of pdfs) {
    try {
      const res = await processFacturePdf(p.pdf, p.attachmentName, {
        source: 'outlook',
        outlookMessageId: p.messageId,
        outlookAttachmentId: p.attachmentId,
      })
      if (res.skipped) {
        processed.push({
          attachmentName: p.attachmentName,
          messageId: p.messageId,
          skipped: true,
          refFacture: res.existingRefFacture,
        })
      } else if (res.rejected) {
        processed.push({
          attachmentName: p.attachmentName,
          messageId: p.messageId,
          rejected: true,
          categorie: res.categorie,
          raison: res.raison,
        })
      } else {
        processed.push({
          attachmentName: p.attachmentName,
          messageId: p.messageId,
          lignesInserted: res.lignesInserted,
          refFacture: res.refFacture,
          fournisseur: res.fournisseur,
          categorie: res.categorie,
        })
      }
    } catch (err) {
      processed.push({
        attachmentName: p.attachmentName,
        messageId: p.messageId,
        error: (err as Error).message,
      })
    }
  }

  return NextResponse.json({ mode: opts.mode, stats, processed })
}

export async function POST(req: NextRequest) {
  return handle(req)
}

export async function GET(req: NextRequest) {
  return handle(req)
}
