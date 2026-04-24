import { ClientSecretCredential } from '@azure/identity'
import { Client } from '@microsoft/microsoft-graph-client'
import 'isomorphic-fetch'
import { requireSetting } from './settings'

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

async function getGraphClient(): Promise<Client> {
  const [tenantId, clientId, clientSecret] = await Promise.all([
    requireSetting('outlook_tenant_id', 'OUTLOOK_TENANT_ID', 'Tenant ID Outlook'),
    requireSetting('outlook_client_id', 'OUTLOOK_CLIENT_ID', 'Client ID Outlook'),
    requireSetting('outlook_client_secret', 'OUTLOOK_CLIENT_SECRET', 'Client Secret Outlook'),
  ])

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

function mailbox(): Promise<string> {
  return requireSetting('outlook_mailbox', 'OUTLOOK_MAILBOX', 'Boîte mail Outlook')
}

export type FetchOptions =
  | { mode: 'latest'; limit: number }
  | { mode: 'since'; since: Date; maxPdfs?: number }

export async function fetchLatestFacturePdfs(
  opts: FetchOptions,
): Promise<{ pdfs: OutlookPdf[]; stats: FetchStats }> {
  const [client, mb] = await Promise.all([getGraphClient(), mailbox()])

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
