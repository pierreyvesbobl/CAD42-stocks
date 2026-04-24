import { ClientSecretCredential } from '@azure/identity'
import { Client } from '@microsoft/microsoft-graph-client'
import 'isomorphic-fetch'

type Attachment = {
  id: string
  name: string
  contentBytes: string
  '@odata.type': string
}

type Message = {
  id: string
  subject: string | null
  receivedDateTime: string
  hasAttachments: boolean
}

export type OutlookPdf = {
  messageId: string
  subject: string
  attachmentId: string
  attachmentName: string
  pdf: Buffer
}

export type FetchStats = {
  messagesScanned: number
  skippedNoAttachment: number
  skippedNoPdf: number
  pdfsFound: number
}

function getGraphClient(): Client {
  const tenantId = process.env.OUTLOOK_TENANT_ID?.trim()
  const clientId = process.env.OUTLOOK_CLIENT_ID?.trim()
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET?.trim()
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('OUTLOOK_TENANT_ID / OUTLOOK_CLIENT_ID / OUTLOOK_CLIENT_SECRET manquants')
  }

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret)

  return Client.init({
    authProvider: async (done) => {
      try {
        const token = await credential.getToken('https://graph.microsoft.com/.default')
        if (!token) throw new Error('Token Graph vide')
        done(null, token.token)
      } catch (err) {
        done(err as Error, null)
      }
    },
  })
}

function mailbox(): string {
  const mb = process.env.OUTLOOK_MAILBOX?.trim()
  if (!mb) throw new Error('OUTLOOK_MAILBOX manquant')
  return mb
}

export type FetchOptions =
  | { mode: 'latest'; limit: number }
  | { mode: 'since'; since: Date; maxPdfs?: number }

export async function fetchLatestFacturePdfs(
  opts: FetchOptions,
): Promise<{ pdfs: OutlookPdf[]; stats: FetchStats }> {
  const client = getGraphClient()
  const mb = mailbox()

  // Graph rejette $filter(hasAttachments) + $orderby — on ordonne par date
  // et on filtre hasAttachments côté client. La dedup (déjà importé) est
  // faite plus tard en DB.
  const isLatest = opts.mode === 'latest'
  const hardLimit = isLatest ? opts.limit : (opts.maxPdfs ?? 100)
  const scanSize = isLatest ? Math.max(opts.limit * 10, 50) : 200

  let query = client
    .api(`/users/${mb}/messages`)
    .orderby('receivedDateTime desc')
    .select('id,subject,receivedDateTime,hasAttachments')
    .top(scanSize)

  if (opts.mode === 'since') {
    // filter sur le même champ que orderby → pas de "restriction too complex"
    query = query.filter(`receivedDateTime ge ${opts.since.toISOString()}`)
  }

  const messages: { value: Message[] } = await query.get()

  const results: OutlookPdf[] = []
  const stats: FetchStats = {
    messagesScanned: messages.value.length,
    skippedNoAttachment: 0,
    skippedNoPdf: 0,
    pdfsFound: 0,
  }

  for (const msg of messages.value) {
    if (results.length >= hardLimit) break

    if (!msg.hasAttachments) {
      stats.skippedNoAttachment++
      continue
    }

    const attachments: { value: Attachment[] } = await client
      .api(`/users/${mb}/messages/${msg.id}/attachments`)
      .get()

    let pdfInThisMessage = 0
    for (const att of attachments.value) {
      if (att['@odata.type'] !== '#microsoft.graph.fileAttachment') continue
      if (!att.name?.toLowerCase().endsWith('.pdf')) continue
      if (!att.contentBytes) continue

      results.push({
        messageId: msg.id,
        subject: msg.subject ?? '(sans objet)',
        attachmentId: att.id,
        attachmentName: att.name,
        pdf: Buffer.from(att.contentBytes, 'base64'),
      })
      pdfInThisMessage++
      if (results.length >= hardLimit) break
    }

    if (pdfInThisMessage === 0) stats.skippedNoPdf++
  }

  stats.pdfsFound = results.length
  return { pdfs: results, stats }
}
