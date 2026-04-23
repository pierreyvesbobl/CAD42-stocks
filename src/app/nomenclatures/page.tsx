'use client'

import { useEffect, useState, useCallback } from 'react'
import { createSupabaseClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Search, Plus, Pencil, Trash2, ArrowLeft, Package } from 'lucide-react'
import { toast } from 'sonner'
import { ComposantModal } from '@/components/composant-modal'

const STATUTS_PRODUIT = ['Composant', 'Produit fini', 'Location']

interface ProduitFini {
  id: string
  reference: string
  nom: string
}

interface Composant {
  id: string
  reference: string
  nom: string
}

interface NomRow {
  id: string
  produit_assemble_id: string
  composant_id: string
  quantite: number
  composant_nom: string
  composant_ref: string
}

interface BomGroup {
  produit: ProduitFini
  lignes: NomRow[]
}

export default function NomenclaturesPage() {
  const [produitsFinis, setProduitsFinis] = useState<ProduitFini[]>([])
  const [composants, setComposants] = useState<Composant[]>([])
  const [nomenclatures, setNomenclatures] = useState<NomRow[]>([])
  const [search, setSearch] = useState('')
  const [selectedProduit, setSelectedProduit] = useState<string | null>(null)

  // Add component dialog
  const [addOpen, setAddOpen] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [addComposantId, setAddComposantId] = useState('')
  const [addQuantite, setAddQuantite] = useState('1')

  // Edit quantity dialog
  const [editOpen, setEditOpen] = useState(false)
  const [editRow, setEditRow] = useState<NomRow | null>(null)
  const [editQuantite, setEditQuantite] = useState('')

  // Delete BOM dialog
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteProduitId, setDeleteProduitId] = useState<string | null>(null)

  // Component detail modal
  const [detailModalId, setDetailModalId] = useState<string | null>(null)

  // Create product dialog
  const [createProductOpen, setCreateProductOpen] = useState(false)
  const [createProductMode, setCreateProductMode] = useState<'composant' | 'produit_fini'>('composant')
  const [newProduct, setNewProduct] = useState({ nom: '', famille: '', statut: 'Composant', prix_ht: '' })
  const [familles, setFamilles] = useState<string[]>([])

  const loadData = useCallback(() => {
    const sb = createSupabaseClient()

    sb.from('produits')
      .select('id, reference, nom')
      .eq('statut', 'Produit fini')
      .order('nom')
      .then(({ data }) => setProduitsFinis(data ?? []))

    sb.from('produits')
      .select('id, reference, nom')
      .eq('statut', 'Composant')
      .order('nom')
      .then(({ data }) => setComposants(data ?? []))

    sb.from('familles')
      .select('nom')
      .order('nom')
      .then(({ data }) => {
        const noms = (data ?? []).map((f: { nom: string }) => f.nom)
        setFamilles(noms)
        if (noms.length > 0 && !newProduct.famille) {
          setNewProduct((p) => ({ ...p, famille: noms[0] }))
        }
      })

    sb.from('nomenclatures')
      .select('id, produit_assemble_id, composant_id, quantite, composant:composant_id(nom, reference)')
      .order('created_at')
      .then(({ data }) => {
        const rows = (data ?? []).map((r: Record<string, unknown>) => ({
          id: r.id as string,
          produit_assemble_id: r.produit_assemble_id as string,
          composant_id: r.composant_id as string,
          quantite: r.quantite as number,
          composant_nom: (r.composant as { nom: string } | null)?.nom ?? '',
          composant_ref: (r.composant as { reference: string } | null)?.reference ?? '',
        }))
        setNomenclatures(rows)
      })
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Group nomenclatures by produit_assemble_id
  const groups: BomGroup[] = produitsFinis
    .filter((p) => nomenclatures.some((n) => n.produit_assemble_id === p.id))
    .map((p) => ({
      produit: p,
      lignes: nomenclatures.filter((n) => n.produit_assemble_id === p.id),
    }))

  const filteredGroups = groups.filter((g) => {
    if (!search.trim()) return true
    const s = search.toLowerCase()
    return (
      g.produit.nom.toLowerCase().includes(s) ||
      g.produit.reference.toLowerCase().includes(s) ||
      g.lignes.some((l) => l.composant_nom.toLowerCase().includes(s))
    )
  })


  // ─── Detail view ───

  const selectedGroup = selectedProduit
    ? groups.find((g) => g.produit.id === selectedProduit)
    : null

  const selectedProduitData = selectedProduit
    ? produitsFinis.find((p) => p.id === selectedProduit)
    : null

  const selectedLignes = selectedProduit
    ? nomenclatures.filter((n) => n.produit_assemble_id === selectedProduit)
    : []

  // ─── Add component ───

  const filteredAddComposants = composants.filter((c) => {
    // Exclude already added
    if (selectedLignes.some((l) => l.composant_id === c.id)) return false
    if (!addSearch.trim()) return true
    const s = addSearch.toLowerCase()
    return c.nom.toLowerCase().includes(s) || c.reference.toLowerCase().includes(s)
  })

  async function handleAddComponent() {
    if (!addComposantId || !selectedProduit) return
    const sb = createSupabaseClient()
    const { error } = await sb.from('nomenclatures').insert({
      produit_assemble_id: selectedProduit,
      composant_id: addComposantId,
      quantite: parseInt(addQuantite, 10) || 1,
    })
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Composant ajouté')
    setAddOpen(false)
    setAddComposantId('')
    setAddQuantite('1')
    setAddSearch('')
    loadData()
  }

  // ─── Edit quantity ───

  function openEdit(row: NomRow) {
    setEditRow(row)
    setEditQuantite(String(row.quantite))
    setEditOpen(true)
  }

  async function handleSaveEdit() {
    if (!editRow) return
    const sb = createSupabaseClient()
    const { error } = await sb
      .from('nomenclatures')
      .update({ quantite: parseInt(editQuantite, 10) || 1 })
      .eq('id', editRow.id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Quantité mise à jour')
    setEditOpen(false)
    loadData()
  }

  // ─── Delete component from BOM ───

  async function handleDeleteComponent(nomId: string) {
    const sb = createSupabaseClient()
    const { error } = await sb.from('nomenclatures').delete().eq('id', nomId)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Composant retiré')
    loadData()
  }

  // ─── Delete entire BOM ───

  async function handleDeleteBom() {
    if (!deleteProduitId) return
    const sb = createSupabaseClient()
    const { error } = await sb
      .from('nomenclatures')
      .delete()
      .eq('produit_assemble_id', deleteProduitId)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Nomenclature supprimée')
    setDeleteOpen(false)
    setSelectedProduit(null)
    loadData()
  }

  // ─── Create new BOM ───

  function openCreateProductFini() {
    setCreateProductMode('produit_fini')
    setNewProduct({ nom: '', famille: familles[0] ?? 'Accessoire', statut: 'Produit fini', prix_ht: '' })
    setCreateProductOpen(true)
  }

  async function handleCreateProductFiniAndBom() {
    if (!newProduct.nom.trim()) {
      toast.error('Nom du produit requis')
      return
    }
    const sb = createSupabaseClient()
    const { data: refData } = await sb.rpc('next_internal_ref')
    const internalRef = (refData as string) ?? `CAD-${Date.now()}`

    const { data, error } = await sb
      .from('produits')
      .insert({
        reference: internalRef,
        nom: newProduct.nom.trim(),
        famille: newProduct.famille,
        statut: 'Produit fini',
        prix_ht: parseFloat(newProduct.prix_ht) || 0,
        stock_actuel: 0,
        seuil_alerte: 0,
      })
      .select('id, reference, nom')
      .single()

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success(`Produit fini "${data.nom}" créé`)
    setCreateProductOpen(false)
    loadData()
    // Open the new BOM directly
    setSelectedProduit(data.id)
  }

  // ─── Create product ───

  function openCreateProduct() {
    setCreateProductMode('composant')
    setNewProduct({ nom: '', famille: familles[0] ?? 'Accessoire', statut: 'Composant', prix_ht: '' })
    setCreateProductOpen(true)
  }

  async function handleCreateProduct() {
    if (!newProduct.nom.trim()) {
      toast.error('Nom du produit requis')
      return
    }
    const sb = createSupabaseClient()
    const { data: refData } = await sb.rpc('next_internal_ref')
    const internalRef = (refData as string) ?? `CAD-${Date.now()}`

    const { data, error } = await sb
      .from('produits')
      .insert({
        reference: internalRef,
        nom: newProduct.nom.trim(),
        famille: newProduct.famille,
        statut: newProduct.statut,
        prix_ht: parseFloat(newProduct.prix_ht) || 0,
        stock_actuel: 0,
        seuil_alerte: 0,
      })
      .select('id, reference, nom')
      .single()

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success(`Produit "${data.nom}" créé`)
    setCreateProductOpen(false)

    // If it's a composant, select it in the add dialog
    if (newProduct.statut === 'Composant') {
      setAddComposantId(data.id)
    }

    loadData()
  }

  // ─── Render: Detail ───

  if (selectedProduit && selectedProduitData) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSelectedProduit(null)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold tracking-tight">
              Nomenclature — {selectedProduitData.nom}
            </h1>
            <p className="text-sm text-muted-foreground font-mono">
              {selectedProduitData.reference}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setAddOpen(true); setAddSearch(''); setAddComposantId('') }}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Ajouter composant
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => { setDeleteProduitId(selectedProduit); setDeleteOpen(true) }}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Supprimer BOM
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {selectedLignes.length} composant{selectedLignes.length > 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedLignes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Aucun composant. Cliquez sur &quot;Ajouter composant&quot; pour commencer.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Composant</TableHead>
                    <TableHead>Référence</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedLignes.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <button type="button" className="font-medium text-blue-700 hover:underline cursor-pointer" onClick={(e) => { e.stopPropagation(); setDetailModalId(l.composant_id) }}>
                          {l.composant_nom}
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {l.composant_ref}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{l.quantite}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(l)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteComponent(l.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Dialog: Add component */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ajouter un composant</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Rechercher un composant</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher..."
                    value={addSearch}
                    onChange={(e) => setAddSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto border rounded-lg">
                {filteredAddComposants.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      Aucun composant disponible
                    </p>
                    <Button size="sm" variant="outline" onClick={() => openCreateProduct()}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Créer un nouveau produit
                    </Button>
                  </div>
                ) : (
                  <>
                    {filteredAddComposants.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent cursor-pointer ${
                          addComposantId === c.id ? 'bg-accent' : ''
                        }`}
                        onClick={() => setAddComposantId(c.id)}
                      >
                        <span className="font-medium">{c.nom}</span>
                        <span className="text-xs text-muted-foreground font-mono">{c.reference}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-accent cursor-pointer border-t"
                      onClick={() => openCreateProduct()}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span className="font-medium">Créer un nouveau produit</span>
                    </button>
                  </>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Quantité</Label>
                <Input
                  type="number"
                  min={1}
                  value={addQuantite}
                  onChange={(e) => setAddQuantite(e.target.value)}
                  className="w-32"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>Annuler</Button>
              <Button onClick={handleAddComponent} disabled={!addComposantId}>Ajouter</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Edit quantity */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Modifier la quantité</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm">
                Composant: <strong>{editRow?.composant_nom}</strong>
              </p>
              <div className="space-y-1.5">
                <Label>Quantité</Label>
                <Input
                  type="number"
                  min={1}
                  value={editQuantite}
                  onChange={(e) => setEditQuantite(e.target.value)}
                  className="w-32"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Annuler</Button>
              <Button onClick={handleSaveEdit}>Enregistrer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Delete BOM */}
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Supprimer la nomenclature</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              Supprimer toute la nomenclature de <strong>{selectedProduitData.nom}</strong> ?
              Tous les composants seront retirés. Cette action est irréversible.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>Annuler</Button>
              <Button variant="destructive" onClick={handleDeleteBom}>Supprimer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Create product */}
        <Dialog open={createProductOpen} onOpenChange={setCreateProductOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                {createProductMode === 'produit_fini' ? 'Créer un nouveau produit fini' : 'Créer un nouveau produit'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Nom du produit</Label>
                <Input
                  value={newProduct.nom}
                  onChange={(e) => setNewProduct((p) => ({ ...p, nom: e.target.value }))}
                  placeholder="Nom du produit"
                />
              </div>
              <div className={createProductMode === 'produit_fini' ? '' : 'grid grid-cols-2 gap-4'}>
                <div className="space-y-1.5">
                  <Label>Famille</Label>
                  <Select
                    value={newProduct.famille}
                    onValueChange={(v) => setNewProduct((p) => ({ ...p, famille: v ?? p.famille }))}
                  >
                    <SelectTrigger>{newProduct.famille || 'Famille'}</SelectTrigger>
                    <SelectContent>
                      {familles.map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {createProductMode !== 'produit_fini' && (
                  <div className="space-y-1.5">
                    <Label>Statut</Label>
                    <Select
                      value={newProduct.statut}
                      onValueChange={(v) => setNewProduct((p) => ({ ...p, statut: v ?? p.statut }))}
                    >
                      <SelectTrigger>{newProduct.statut}</SelectTrigger>
                      <SelectContent>
                        {STATUTS_PRODUIT.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Prix HT unitaire</Label>
                <Input
                  type="number"
                  value={newProduct.prix_ht}
                  onChange={(e) => setNewProduct((p) => ({ ...p, prix_ht: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateProductOpen(false)}>Annuler</Button>
              <Button onClick={createProductMode === 'produit_fini' ? handleCreateProductFiniAndBom : handleCreateProduct}>
                <Plus className="h-4 w-4 mr-1" />
                Créer le produit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ComposantModal
          composantId={detailModalId}
          open={!!detailModalId}
          onClose={() => setDetailModalId(null)}
          onChanged={loadData}
        />
      </div>
    )
  }

  // ─── Render: List ───

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Nomenclatures (BOM)</h1>
        <Button onClick={() => openCreateProductFini()}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nouvelle nomenclature
        </Button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filteredGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Aucune nomenclature trouvée.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredGroups.map((g) => (
            <Card
              key={g.produit.id}
              className="cursor-pointer hover:border-[#a6cb4d]/50 transition-colors"
              onClick={() => setSelectedProduit(g.produit.id)}
            >
              <CardContent className="py-3">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{g.produit.nom}</span>
                    <span className="text-xs text-muted-foreground font-mono ml-2">
                      {g.produit.reference}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {g.lignes.length} composant{g.lignes.length > 1 ? 's' : ''}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog: Create product fini */}
      <Dialog open={createProductOpen} onOpenChange={setCreateProductOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Créer un nouveau produit fini
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nom du produit</Label>
              <Input
                value={newProduct.nom}
                onChange={(e) => setNewProduct((p) => ({ ...p, nom: e.target.value }))}
                placeholder="Nom du produit"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Famille</Label>
              <Select
                value={newProduct.famille}
                onValueChange={(v) => setNewProduct((p) => ({ ...p, famille: v ?? p.famille }))}
              >
                <SelectTrigger>{newProduct.famille || 'Famille'}</SelectTrigger>
                <SelectContent>
                  {familles.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prix HT unitaire</Label>
              <Input
                type="number"
                value={newProduct.prix_ht}
                onChange={(e) => setNewProduct((p) => ({ ...p, prix_ht: e.target.value }))}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateProductOpen(false)}>Annuler</Button>
            <Button onClick={handleCreateProductFiniAndBom}>
              <Plus className="h-4 w-4 mr-1" />
              Créer le produit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
