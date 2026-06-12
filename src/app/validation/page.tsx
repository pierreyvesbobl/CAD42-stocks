'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createSupabaseClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProductCombobox } from '@/components/product-combobox'
import { getDefaultSeuilAlerte } from '@/lib/app-settings'
import { FileText, Plus, Package, ArrowLeft, ExternalLink, Pencil, Mail, Upload, Loader2, Trash2, Copy as CopyIcon } from 'lucide-react'
import { cn, normSearch } from '@/lib/utils'
import { toast } from 'sonner'

// ─── Types ───

interface ValidationRow {
  id: string
  ligne: string
  confiance_ia: string | null
  produit_suggere_id: string | null
  produit_suggere_reference: string | null
  ref_detectee: string | null
  quantite: number | null
  prix_ht_unitaire: number | null
  fournisseur: string | null
  ref_facture: string | null
  date_facture: string | null
  pdf_storage_path: string | null
  statut: string | null
  lot_size: number | null
  lot_source: string | null
  suggested_nom: string | null
  suggested_famille: string | null
  suggested_description: string | null
  lien_url: string | null
  lien_url_source: string | null
}

interface ProduitOption {
  id: string
  reference: string
  nom: string
  description: string | null
  famille: string | null
  statut: string | null
}

interface Facture {
  ref_facture: string
  fournisseur: string | null
  date_facture: string | null
  pdf_storage_path: string | null
  total: number
  validees: number
  rejetees: number
  en_attente: number
}

interface FactureRejetee {
  id: string
  file_name: string | null
  fournisseur: string | null
  date_facture: string | null
  categorie: string | null
  raison_rejet: string | null
  pdf_storage_path: string
  imported_at: string
}

const FAMILLES_DEFAULT = ['RTK', 'Kit', 'Gateway', 'Accessoire', 'Autre']
const STATUTS_PRODUIT = ['Composant', 'Produit fini']

// ─── Page ───

export default function ValidationPage() {
  const [allRows, setAllRows] = useState<ValidationRow[]>([])
  const [rejectedImports, setRejectedImports] = useState<FactureRejetee[]>([])
  const [produits, setProduits] = useState<ProduitOption[]>([])
  const [overrides, setOverrides] = useState<
    Record<string, { produitId: string; quantite: string; prix: string; ref: string }>
  >({})

  const [selectedFacture, setSelectedFacture] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('a_traiter')

  const [editingRowIds, setEditingRowIds] = useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)
  const [createForRowId, setCreateForRowId] = useState<string | null>(null)
  const [newProduct, setNewProduct] = useState({
    nom: '',
    famille: 'Accessoire',
    statut: 'Composant',
    prix_ht: '',
    description: '',
    seuil_alerte: '',
  })
  const [familles, setFamilles] = useState<string[]>(FAMILLES_DEFAULT)

  const [fetching, setFetching] = useState(false)
  const [uploading, setUploading] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const loadData = useCallback(() => {
    const sb = createSupabaseClient()
    sb.from('file_validation')
      .select('*, produits:produit_suggere_id(nom)')
      .not('ref_facture', 'is', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const items = (data ?? []).map((r: Record<string, unknown>) => ({
          ...r,
          produit_suggere_reference:
            (r.produits as { nom: string } | null)?.nom ?? null,
        })) as ValidationRow[]
        setAllRows(items)

        setOverrides((prev) => {
          const next = { ...prev }
          items.forEach((r) => {
            // Garde les valeurs déjà saisies par l'utilisateur ; ne (ré)initialise
            // que les lignes inconnues du state local.
            if (!next[r.id]) {
              next[r.id] = {
                produitId: r.produit_suggere_id ?? '',
                quantite: String(r.quantite ?? 1),
                prix: r.prix_ht_unitaire != null ? String(r.prix_ht_unitaire) : '',
                ref: r.ref_detectee ?? '',
              }
            }
          })
          return next
        })
      })

    sb.from('produits')
      .select('id, reference, nom, description, famille, statut')
      .order('nom')
      .then(({ data }) => setProduits((data as ProduitOption[]) ?? []))

    sb.from('familles')
      .select('nom')
      .order('nom')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setFamilles((data as { nom: string }[]).map((f) => f.nom))
        }
      })

    sb.from('factures_imports')
      .select('id, file_name, fournisseur, date_facture, categorie, raison_rejet, pdf_storage_path, imported_at')
      .eq('statut_import', 'rejete')
      .order('imported_at', { ascending: false })
      .then(({ data }) => setRejectedImports((data as FactureRejetee[]) ?? []))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ─── Factures aggregation ───

  const factures: Facture[] = (() => {
    const map = new Map<string, Facture>()
    for (const r of allRows) {
      const key = r.ref_facture!
      if (!map.has(key)) {
        map.set(key, {
          ref_facture: key,
          fournisseur: r.fournisseur,
          date_facture: r.date_facture,
          pdf_storage_path: r.pdf_storage_path,
          total: 0,
          validees: 0,
          rejetees: 0,
          en_attente: 0,
        })
      }
      const f = map.get(key)!
      f.total++
      const s = r.statut ?? ''
      if (s.includes('Valid')) f.validees++
      else if (s.includes('Rejet')) f.rejetees++
      else f.en_attente++
    }
    return Array.from(map.values()).sort((a, b) => {
      if (!a.date_facture) return 1
      if (!b.date_facture) return -1
      return b.date_facture.localeCompare(a.date_facture)
    })
  })()

  function factureStatut(f: Facture): 'traitee' | 'en_cours' | 'a_traiter' | 'rejetee' {
    if (f.en_attente > 0) {
      if (f.validees > 0 || f.rejetees > 0) return 'en_cours'
      return 'a_traiter'
    }
    // plus de lignes en attente
    if (f.validees === 0 && f.rejetees > 0) return 'rejetee'
    return 'traitee'
  }

  const filteredFactures = factures.filter((f) => {
    if (search.trim()) {
      const s = normSearch(search)
      if (
        !normSearch(f.ref_facture).includes(s) &&
        !normSearch(f.fournisseur).includes(s)
      )
        return false
    }
    const st = factureStatut(f)
    if (tab === 'a_traiter') return st === 'a_traiter' || st === 'en_cours'
    if (tab === 'traitees') return st === 'traitee'
    return false
  })

  const countATraiter = factures.filter((f) => {
    const st = factureStatut(f)
    return st === 'a_traiter' || st === 'en_cours'
  }).length
  const countTraitees = factures.filter((f) => factureStatut(f) === 'traitee').length
  const facturesRejeteesManuel = factures.filter((f) => factureStatut(f) === 'rejetee')
  const countRejetees = rejectedImports.length + facturesRejeteesManuel.length

  // ─── Detail facture ───

  const selectedRows = selectedFacture
    ? allRows.filter((r) => r.ref_facture === selectedFacture)
    : []
  const pendingRows = selectedRows.filter(
    (r) => r.statut?.includes('valider') || r.statut === 'A valider' || r.statut === 'À valider'
  )
  const doneRows = selectedRows.filter(
    (r) => r.statut?.includes('Valid') || r.statut?.includes('Rejet')
  )
  const selectedFactureData = factures.find((f) => f.ref_facture === selectedFacture)

  async function openFacture(ref: string, pdfPath: string | null) {
    setSelectedFacture(ref)
    setPdfUrl(null)
    if (pdfPath) {
      const res = await fetch(`/api/facture-pdf?ref=${encodeURIComponent(ref)}`)
      if (res.ok) {
        const { url } = await res.json()
        setPdfUrl(url)
      }
    }
  }

  // ─── Actions ───

  function updateOverride(
    id: string,
    field: 'produitId' | 'quantite' | 'prix' | 'ref',
    value: string,
  ) {
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  // #5 — pré-remplit le prix avec le dernier prix observé pour ce couple
  // produit / fournisseur, lu sur file_validation. On ne touche pas au prix
  // si l'utilisateur en a déjà saisi un.
  async function maybePrefillLastPrice(rowId: string, produitId: string) {
    if (!produitId) return
    const row = allRows.find((r) => r.id === rowId)
    if (!row) return
    const current = overrides[rowId]?.prix
    if (current && current !== (row.prix_ht_unitaire != null ? String(row.prix_ht_unitaire) : '')) {
      // l'utilisateur a déjà tapé une valeur différente du prix initial → on respecte
      return
    }
    const sb = createSupabaseClient()
    let q = sb
      .from('file_validation')
      .select('prix_ht_unitaire, date_facture, created_at')
      .eq('produit_suggere_id', produitId)
      .ilike('statut', 'Valid%')
      .not('prix_ht_unitaire', 'is', null)
      .order('date_facture', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
    if (row.fournisseur) q = q.eq('fournisseur', row.fournisseur)
    const { data } = await q.maybeSingle()
    if (data?.prix_ht_unitaire != null) {
      updateOverride(rowId, 'prix', String(data.prix_ht_unitaire))
    }
  }

  // Persiste les éditions (qté/prix/ref) en base avant validation
  async function persistRowEdits(row: ValidationRow): Promise<void> {
    const o = overrides[row.id]
    if (!o) return
    const patch: Record<string, unknown> = {}
    const newQte = parseFloat(o.quantite)
    if (!isNaN(newQte) && newQte !== row.quantite) patch.quantite = newQte
    const newPrix = o.prix.trim() === '' ? null : parseFloat(o.prix)
    if ((newPrix ?? null) !== (row.prix_ht_unitaire ?? null)) patch.prix_ht_unitaire = newPrix
    const newRef = o.ref.trim() === '' ? null : o.ref.trim()
    if ((newRef ?? null) !== (row.ref_detectee ?? null)) patch.ref_detectee = newRef
    if (Object.keys(patch).length === 0) return
    const sb = createSupabaseClient()
    await sb.from('file_validation').update(patch).eq('id', row.id)
  }

  async function handleAddLine() {
    if (!selectedFacture) return
    const ref = selectedRows[0]
    if (!ref) return
    const sb = createSupabaseClient()
    const { error } = await sb.from('file_validation').insert({
      ligne: '(ligne ajoutée manuellement)',
      ref_detectee: null,
      quantite: 1,
      prix_ht_unitaire: null,
      fournisseur: ref.fournisseur,
      ref_facture: ref.ref_facture,
      date_facture: ref.date_facture,
      pdf_storage_path: ref.pdf_storage_path,
      confiance_ia: 'Inconnu',
      statut: 'À valider',
    })
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Ligne ajoutée')
    loadData()
  }

  // Duplique une ligne de facture (statut remis « À valider ») — utile quand
  // une ligne regroupe plusieurs produits à valider séparément.
  async function handleDuplicateLine(row: ValidationRow) {
    const o = overrides[row.id]
    const sb = createSupabaseClient()
    const { error } = await sb.from('file_validation').insert({
      ligne: row.ligne,
      ref_detectee: o?.ref?.trim() || row.ref_detectee,
      quantite: parseFloat(o?.quantite ?? '') || row.quantite,
      prix_ht_unitaire: o?.prix?.trim() ? parseFloat(o.prix) : row.prix_ht_unitaire,
      fournisseur: row.fournisseur,
      ref_facture: row.ref_facture,
      date_facture: row.date_facture,
      pdf_storage_path: row.pdf_storage_path,
      confiance_ia: row.confiance_ia,
      produit_suggere_id: o?.produitId || row.produit_suggere_id,
      lot_size: row.lot_size,
      lot_source: row.lot_source,
      lien_url: row.lien_url,
      lien_url_source: row.lien_url_source,
      statut: 'À valider',
    })
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Ligne dupliquée')
    loadData()
  }

  async function handleDeleteLine(rowId: string) {
    const sb = createSupabaseClient()
    const { error } = await sb.from('file_validation').delete().eq('id', rowId)
    if (error) {
      toast.error(error.message)
      return
    }
    setOverrides((prev) => {
      const n = { ...prev }
      delete n[rowId]
      return n
    })
    toast.success('Ligne supprimée')
    loadData()
  }

  // Propage le lien Amazon de la ligne facture vers references_fournisseurs
  // pour qu'il survive après la validation et soit visible depuis la fiche
  // composant. Cible: la ref_fournisseurs identifiée par (produit_id + ref_detectee).
  async function persistSupplierLink(produitId: string, row: ValidationRow) {
    const refValue = (overrides[row.id]?.ref ?? row.ref_detectee ?? '').trim()
    if (!row.lien_url || !refValue) return
    const sb = createSupabaseClient()
    // upsert manuel: si l'entrée existe, on update; sinon on l'insère.
    const { data: existing } = await sb
      .from('references_fournisseurs')
      .select('id, lien_url')
      .eq('produit_id', produitId)
      .eq('reference', refValue)
      .maybeSingle()
    if (existing) {
      if (!existing.lien_url) {
        await sb
          .from('references_fournisseurs')
          .update({ lien_url: row.lien_url, lien_verifie_le: new Date().toISOString() })
          .eq('id', existing.id)
      }
    } else {
      await sb.from('references_fournisseurs').insert({
        produit_id: produitId,
        reference: refValue,
        fournisseur: row.fournisseur,
        lien_url: row.lien_url,
        lien_verifie_le: new Date().toISOString(),
      })
    }
  }

  async function handleValidate(row: ValidationRow) {
    const o = overrides[row.id]
    if (!o?.produitId) {
      toast.error('Sélectionnez un produit')
      return
    }
    await persistRowEdits(row)
    const sb = createSupabaseClient()
    const { data, error } = await sb.rpc('validate_file_validation', {
      p_validation_id: row.id,
      p_produit_id: o.produitId,
      p_quantite: parseFloat(o.quantite) || 1,
      p_utilisateur: 'Rafa',
    })
    if (error) {
      toast.error(error.message)
    } else {
      await persistSupplierLink(o.produitId, row)
      const res = data as { success: boolean; produit: string; quantite_ajoutee: number }
      toast.success(`+${res.quantite_ajoutee} ${res.produit}`)
      loadData()
    }
  }

  async function handleReject(id: string) {
    const sb = createSupabaseClient()
    const { error } = await sb
      .from('file_validation')
      .update({ statut: 'Rejeté', valide_par: 'Rafa' })
      .eq('id', id)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Ligne rejetée')
      loadData()
    }
  }

  async function handleRevalidate(row: ValidationRow) {
    const o = overrides[row.id]
    if (!o?.produitId) {
      toast.error('Sélectionnez un produit')
      return
    }
    await persistRowEdits(row)
    const sb = createSupabaseClient()

    // Annuler l'ancien mouvement si la ligne etait validee
    if (row.statut?.includes('Valid') && row.produit_suggere_id) {
      const { data: produit } = await sb
        .from('produits')
        .select('stock_actuel')
        .eq('id', row.produit_suggere_id)
        .single()
      if (produit) {
        await sb
          .from('produits')
          .update({ stock_actuel: produit.stock_actuel - (row.quantite ?? 0) })
          .eq('id', row.produit_suggere_id)
      }
      await sb
        .from('mouvements')
        .delete()
        .eq('source', 'Facture auto')
        .eq('ref_facture', row.ref_facture)
        .eq('produit_id', row.produit_suggere_id)
    }

    // Remettre en attente puis revalider
    await sb
      .from('file_validation')
      .update({ statut: 'À valider', produit_suggere_id: o.produitId })
      .eq('id', row.id)

    const { data, error } = await sb.rpc('validate_file_validation', {
      p_validation_id: row.id,
      p_produit_id: o.produitId,
      p_quantite: parseFloat(o.quantite) || 1,
      p_utilisateur: 'Rafa',
    })
    if (error) {
      toast.error(error.message)
    } else {
      const res = data as { success: boolean; produit: string; quantite_ajoutee: number }
      toast.success(`Re-validé: +${res.quantite_ajoutee} ${res.produit}`)
      loadData()
    }
  }

  async function handleReopen(id: string) {
    const sb = createSupabaseClient()
    const { error } = await sb
      .from('file_validation')
      .update({ statut: 'À valider', valide_par: null })
      .eq('id', id)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Ligne remise en attente')
      loadData()
    }
  }

  async function handleFetchOutlook() {
    setFetching(true)
    try {
      const res = await fetch('/api/factures/fetch-outlook?sinceHours=24', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Échec récupération Outlook')
        return
      }
      type ProcessedItem = { error?: string; skipped?: boolean }
      const items: ProcessedItem[] = data.processed ?? []
      const imported = items.filter((p) => !p.error && !p.skipped).length
      const skipped = items.filter((p) => p.skipped).length
      const errored = items.filter((p) => !!p.error).length
      const s = data.stats
      const detail = s
        ? ` · scan ${s.messagesScanned} (sans PJ ${s.skippedNoAttachment}, sans PDF ${s.skippedNoPdf})`
        : ''
      let msg = `${imported} facture(s) importée(s)`
      type ProcItem = { error?: string; skipped?: boolean; rejected?: boolean }
      const rejected = (items as ProcItem[]).filter((p) => p.rejected).length
      if (skipped) msg += `, ${skipped} doublon(s) ignoré(s)`
      if (rejected) msg += `, ${rejected} rejetée(s) en amont`
      if (errored) msg += `, ${errored} erreur(s)`
      toast.success(msg + detail)
      loadData()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setFetching(false)
    }
  }

  async function handleUploadFacture(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/factures/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Échec upload')
        return
      }
      if (data.skipped) {
        toast.info(`Doublon ignoré : ${data.fileName} déjà importé (${data.existingRefFacture ?? 'sans ref'})`)
      } else if (data.rejected) {
        toast.info(`Facture rejetée en amont (${data.categorie}) : ${data.raison ?? 'non-stockable'}`)
      } else {
        toast.success(`${data.lignesInserted} ligne(s) importée(s) depuis ${data.fileName}`)
      }
      loadData()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  async function openCreateProduct(rowId: string, _refDetectee: string | null) {
    setCreateForRowId(rowId)
    const row = allRows.find((r) => r.id === rowId)
    // Pré-remplissage avec la suggestion de l'agent référence (#7) + le seuil
    // par défaut côté paramètres (#9). Aucun champ ne reste vide à la création
    // (#8) : le validateur n'a plus qu'à amender.
    const seuil = await getDefaultSeuilAlerte()
    const fallbackFamille = familles.length > 0 ? familles[0] : 'Accessoire'
    setNewProduct({
      nom: row?.suggested_nom ?? '',
      famille: row?.suggested_famille ?? fallbackFamille,
      statut: 'Composant',
      prix_ht: row?.prix_ht_unitaire != null ? String(row.prix_ht_unitaire) : '',
      description: row?.suggested_description ?? '',
      seuil_alerte: String(seuil),
    })
    setCreateOpen(true)
  }

  async function handleCreateProduct() {
    if (!newProduct.nom.trim()) {
      toast.error('Nom du produit requis')
      return
    }
    const sb = createSupabaseClient()

    // Get next internal reference
    const { data: refData } = await sb.rpc('next_internal_ref')
    const internalRef = (refData as string) ?? `CAD-${Date.now()}`
    const seuilFromForm = parseInt(newProduct.seuil_alerte, 10)
    const seuilApplied = Number.isFinite(seuilFromForm) && seuilFromForm >= 0
      ? seuilFromForm
      : await getDefaultSeuilAlerte()

    const { data, error } = await sb
      .from('produits')
      .insert({
        reference: internalRef,
        nom: newProduct.nom.trim(),
        famille: newProduct.famille,
        statut: newProduct.statut,
        prix_ht: parseFloat(newProduct.prix_ht) || 0,
        stock_actuel: 0,
        seuil_alerte: seuilApplied,
        description: newProduct.description.trim() || null,
      })
      .select('id, reference, nom, description, famille, statut')
      .single()

    if (error) {
      toast.error(error.message)
      return
    }

    const created = data as ProduitOption

    // If there's a detected ref from the invoice, save it as a supplier ref —
    // avec le lien Amazon trouvé à l'import si disponible (#4).
    const row = allRows.find((r) => r.id === createForRowId)
    if (row?.ref_detectee) {
      await sb.from('references_fournisseurs').insert({
        produit_id: created.id,
        reference: row.ref_detectee,
        fournisseur: row.fournisseur,
        lien_url: row.lien_url ?? null,
        lien_verifie_le: row.lien_url ? new Date().toISOString() : null,
      })
    }

    setProduits((prev) =>
      [...prev, created].sort((a, b) => a.nom.localeCompare(b.nom))
    )
    if (createForRowId) {
      updateOverride(createForRowId, 'produitId', created.id)
    }
    toast.success(`Produit "${created.nom}" créé`)
    setCreateOpen(false)
  }

  function confianceBadge(c: string | null) {
    switch (c) {
      case 'Connu':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[11px]">Connu</Badge>
      case 'Similaire':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[11px]">Similaire</Badge>
      case 'Inconnu':
        return <Badge variant="destructive" className="text-[11px]">Inconnu</Badge>
      default:
        return null
    }
  }

  function statutBadge(f: Facture) {
    const s = factureStatut(f)
    switch (s) {
      case 'traitee':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[11px]">Traitée</Badge>
      case 'en_cours':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[11px]">En cours</Badge>
      case 'a_traiter':
        return <Badge variant="destructive" className="text-[11px]">À traiter</Badge>
    }
  }

  // ─── Render: Detail facture ───

  if (selectedFacture) {
    return (
      <div className="space-y-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSelectedFacture(null)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">
              Facture {selectedFacture}
            </h1>
            <p className="text-sm text-muted-foreground">
              {selectedFactureData?.fournisseur ?? ''}
              {selectedFactureData?.date_facture
                ? ` — ${selectedFactureData.date_facture}`
                : ''}
              {' — '}
              {pendingRows.length} en attente, {doneRows.length} traitée{doneRows.length > 1 ? 's' : ''}
            </p>
          </div>
          {pdfUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(pdfUrl, '_blank')}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Plein écran
            </Button>
          )}
        </div>

        {/* Lignes — toutes au même endroit, même format */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Édite les lignes (qté, prix, réf) directement avant de valider. Le bouton + ajoute une ligne manquée par l&apos;agent.
            </p>
            <Button size="sm" variant="outline" onClick={handleAddLine}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Ajouter une ligne
            </Button>
          </div>
          {selectedRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Aucune ligne pour cette facture.
            </p>
          ) : (
            selectedRows.map((r) => {
              const isPending = r.statut?.includes('valider') || r.statut === 'A valider' || r.statut === 'À valider'
              const isValidated = r.statut?.includes('Valid') && !isPending
              const isRejected = r.statut?.includes('Rejet')
              const isTreated = isValidated || isRejected

              return (
                <Card key={r.id} className={isTreated ? 'border-l-4 opacity-50 hover:opacity-100 transition-opacity ' + (isValidated ? 'border-l-emerald-400' : 'border-l-red-400') : ''}>
                  <CardContent className="py-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isTreated && (
                        <Badge
                          className={cn(
                            'text-[11px]',
                            isValidated
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : 'bg-red-100 text-red-800 border-red-200'
                          )}
                        >
                          {r.statut}
                        </Badge>
                      )}
                      {confianceBadge(r.confiance_ia)}
                      {r.lot_size && r.lot_size > 1 && (
                        <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-[11px]">
                          Lot de {r.lot_size}
                          {r.lot_source ? ` (${r.lot_source})` : ''}
                        </Badge>
                      )}
                      <span className="text-sm">{r.ligne}</span>
                    </div>

                    {r.ref_detectee && (
                      <p className="text-xs text-muted-foreground">
                        Réf : <span className="font-mono text-foreground">{r.ref_detectee}</span>
                        {r.lien_url && (
                          <>
                            {' · '}
                            <a
                              href={r.lien_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Voir sur Amazon
                            </a>
                          </>
                        )}
                      </p>
                    )}

                    {r.produit_suggere_reference && r.confiance_ia !== 'Inconnu' && isPending && (
                      <p className="text-xs">
                        <span className="text-muted-foreground">Suggestion : </span>
                        <span className="font-medium text-emerald-700">{r.produit_suggere_reference}</span>
                      </p>
                    )}

                    {r.confiance_ia === 'Inconnu' && isPending && r.suggested_nom && (
                      <p className="text-xs">
                        <span className="text-muted-foreground">Nom proposé par l&apos;agent : </span>
                        <span className="font-medium text-blue-700">{r.suggested_nom}</span>
                        <button
                          type="button"
                          className="ml-2 text-blue-600 hover:underline"
                          onClick={() => openCreateProduct(r.id, r.ref_detectee)}
                        >
                          Créer ce composant
                        </button>
                      </p>
                    )}

                    {r.confiance_ia === 'Inconnu' && isPending && !r.suggested_nom && (
                      <p className="text-xs text-amber-700">
                        Aucune correspondance — sélectionnez ou créez un produit.
                      </p>
                    )}

                    {isTreated && !editingRowIds.has(r.id) ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground flex-1 truncate">
                          {produits.find((p) => p.id === (overrides[r.id]?.produitId || r.produit_suggere_id))?.nom ?? '—'}
                          {' '}
                          <span className="tabular-nums">x{overrides[r.id]?.quantite ?? r.quantite ?? 1}</span>
                          {(overrides[r.id]?.prix || r.prix_ht_unitaire != null) && (
                            <> · <span className="tabular-nums">{overrides[r.id]?.prix || r.prix_ht_unitaire}€</span></>
                          )}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          onClick={() => setEditingRowIds((prev) => new Set(prev).add(r.id))}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          Modifier
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-12 gap-2 items-end">
                          <div className="col-span-4">
                            <Label className="text-[11px] text-muted-foreground">Produit</Label>
                            <ProductCombobox
                              products={produits}
                              selectedId={overrides[r.id]?.produitId ?? ''}
                              onSelect={(id) => {
                                updateOverride(r.id, 'produitId', id)
                                maybePrefillLastPrice(r.id, id)
                              }}
                              onCreateNew={() => openCreateProduct(r.id, r.ref_detectee)}
                            />
                          </div>
                          <div className="col-span-3">
                            <Label className="text-[11px] text-muted-foreground">Réf détectée</Label>
                            <Input
                              className="h-9"
                              value={overrides[r.id]?.ref ?? ''}
                              onChange={(e) => updateOverride(r.id, 'ref', e.target.value)}
                              placeholder="Réf fournisseur"
                            />
                          </div>
                          <div className="col-span-1">
                            <Label className="text-[11px] text-muted-foreground">Qté</Label>
                            <Input
                              type="number"
                              className="h-9"
                              value={overrides[r.id]?.quantite ?? String(r.quantite ?? 1)}
                              onChange={(e) => updateOverride(r.id, 'quantite', e.target.value)}
                            />
                          </div>
                          <div className="col-span-2">
                            <Label className="text-[11px] text-muted-foreground">Prix HT (€)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              className="h-9"
                              value={overrides[r.id]?.prix ?? ''}
                              onChange={(e) => updateOverride(r.id, 'prix', e.target.value)}
                              placeholder="0.00"
                            />
                          </div>
                          <div className="col-span-2 flex justify-end">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 text-muted-foreground hover:text-foreground"
                              onClick={() => handleDuplicateLine(r)}
                              title="Dupliquer la ligne"
                            >
                              <CopyIcon className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteLine(r.id)}
                              title="Supprimer la ligne"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 justify-end">
                          {isTreated ? (
                            <>
                              <Button size="sm" className="h-9" onClick={async () => { await handleRevalidate(r); setEditingRowIds((prev) => { const n = new Set(prev); n.delete(r.id); return n }) }}>
                                Valider
                              </Button>
                              <Button size="sm" variant="outline" className="h-9" onClick={() => { handleReopen(r.id); setEditingRowIds((prev) => { const n = new Set(prev); n.delete(r.id); return n }) }}>
                                {isRejected ? 'Réouvrir' : 'Rejeter'}
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" className="h-9" onClick={() => handleValidate(r)}>
                                Valider
                              </Button>
                              <Button size="sm" variant="outline" className="h-9" onClick={() => handleReject(r.id)}>
                                Rejeter
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>

        {/* #2 — preview PDF inline (sous les lignes pour garder les contrôles visibles) */}
        {pdfUrl && (
          <Card className="overflow-hidden">
            <iframe
              src={pdfUrl}
              title={`Facture ${selectedFacture}`}
              className="w-full h-[80vh] bg-muted/20"
            />
          </Card>
        )}

        {/* Dialog creation produit */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Créer un nouveau produit
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Nom du produit</Label>
                <Input
                  value={newProduct.nom}
                  onChange={(e) =>
                    setNewProduct((p) => ({ ...p, nom: e.target.value }))
                  }
                  placeholder="Nom du produit"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Famille</Label>
                  <Select
                    value={newProduct.famille}
                    onValueChange={(v) =>
                      setNewProduct((p) => ({
                        ...p,
                        famille: v ?? p.famille,
                      }))
                    }
                  >
                    <SelectTrigger>{newProduct.famille}</SelectTrigger>
                    <SelectContent>
                      {familles.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Statut</Label>
                  <Select
                    value={newProduct.statut}
                    onValueChange={(v) =>
                      setNewProduct((p) => ({
                        ...p,
                        statut: v ?? p.statut,
                      }))
                    }
                  >
                    <SelectTrigger>{newProduct.statut}</SelectTrigger>
                    <SelectContent>
                      {STATUTS_PRODUIT.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Prix HT unitaire</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newProduct.prix_ht}
                    onChange={(e) =>
                      setNewProduct((p) => ({ ...p, prix_ht: e.target.value }))
                    }
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Seuil d&apos;alerte</Label>
                  <Input
                    type="number"
                    min={0}
                    value={newProduct.seuil_alerte}
                    onChange={(e) =>
                      setNewProduct((p) => ({ ...p, seuil_alerte: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input
                  value={newProduct.description}
                  onChange={(e) =>
                    setNewProduct((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="Description technique courte"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleCreateProduct}>
                <Plus className="h-4 w-4 mr-1" />
                Créer le produit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // ─── Render: Liste factures ───

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Validation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {factures.length + rejectedImports.length} facture{factures.length + rejectedImports.length > 1 ? 's' : ''} en entrée
            {countRejetees > 0 && ` · ${countATraiter + countTraitees} conservée${countATraiter + countTraitees > 1 ? 's' : ''}, ${countRejetees} rejetée${countRejetees > 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleFetchOutlook}
            disabled={fetching || uploading}
          >
            {fetching ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Mail className="h-4 w-4 mr-2" />
            )}
            Récupérer Outlook (24h)
          </Button>
          <input
            ref={uploadInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleUploadFacture(f)
              e.target.value = ''
            }}
          />
          <Button
            onClick={() => uploadInputRef.current?.click()}
            disabled={fetching || uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Importer une facture
          </Button>
        </div>
      </div>

      <Input
        placeholder="Rechercher par réf ou fournisseur..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-80"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="a_traiter">À traiter ({countATraiter})</TabsTrigger>
          <TabsTrigger value="traitees">Traitées ({countTraitees})</TabsTrigger>
          <TabsTrigger value="rejetees">Rejetées ({countRejetees})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {tab === 'rejetees' ? (
            countRejetees === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Aucune facture rejetée.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {rejectedImports.map((r) => (
                  <Card
                    key={`amont-${r.id}`}
                    className="cursor-pointer hover:border-[#a6cb4d]/50 transition-colors"
                    onClick={async () => {
                      const res = await fetch(`/api/facture-pdf?storagePath=${encodeURIComponent(r.pdf_storage_path)}`)
                      if (!res.ok) {
                        toast.error('PDF introuvable')
                        return
                      }
                      const { url } = await res.json()
                      window.open(url, '_blank')
                    }}
                  >
                    <CardContent className="py-3">
                      <div className="flex items-center gap-4">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate max-w-md">
                          {r.file_name ?? '(fichier)'}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {r.fournisseur ?? '—'}
                        </span>
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {r.date_facture ?? '—'}
                        </span>
                        <div className="ml-auto flex items-center gap-3">
                          <Badge variant="outline" className="text-xs">
                            {r.categorie ?? 'rejete'}
                          </Badge>
                          <span className="text-xs text-muted-foreground max-w-xs truncate">
                            {r.raison_rejet ?? '—'}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {facturesRejeteesManuel.map((f) => (
                  <Card
                    key={`manuel-${f.ref_facture}`}
                    className="cursor-pointer hover:border-[#a6cb4d]/50 transition-colors"
                    onClick={() => openFacture(f.ref_facture, f.pdf_storage_path)}
                  >
                    <CardContent className="py-3">
                      <div className="flex items-center gap-4">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-mono text-sm font-medium">
                          {f.ref_facture}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {f.fournisseur ?? '—'}
                        </span>
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {f.date_facture ?? '—'}
                        </span>
                        <div className="ml-auto flex items-center gap-3">
                          <Badge variant="outline" className="text-xs">manuel</Badge>
                          <span className="text-xs text-muted-foreground">
                            {f.rejetees} ligne{f.rejetees > 1 ? 's' : ''} rejetée{f.rejetees > 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          ) : filteredFactures.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Aucune facture.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredFactures.map((f) => (
                <Card
                  key={f.ref_facture}
                  className="cursor-pointer hover:border-[#a6cb4d]/50 transition-colors"
                  onClick={() => openFacture(f.ref_facture, f.pdf_storage_path)}
                >
                  <CardContent className="py-3">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 shrink-0">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono text-sm font-medium">
                          {f.ref_facture}
                        </span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {f.fournisseur ?? '—'}
                      </span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {f.date_facture ?? '—'}
                      </span>
                      <div className="ml-auto flex items-center gap-3">
                        {statutBadge(f)}
                        <div className="flex items-center gap-2 text-xs tabular-nums">
                          {f.en_attente > 0 && (
                            <span className="text-amber-600">
                              {f.en_attente} en attente
                            </span>
                          )}
                          {f.validees > 0 && (
                            <span className="text-emerald-700">
                              {f.validees} validée{f.validees > 1 ? 's' : ''}
                            </span>
                          )}
                          {f.rejetees > 0 && (
                            <span className="text-red-600">
                              {f.rejetees} rejetée{f.rejetees > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
