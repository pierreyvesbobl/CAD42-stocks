'use client'

import { useEffect, useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase/client'
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
import { Package, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { getDefaultSeuilAlerte } from '@/lib/app-settings'

const STATUTS = ['Composant', 'Produit fini']

interface ProduitCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Statut pré-sélectionné (« Composant » sur la page Composants, etc.)
  defaultStatut?: string
  onCreated?: (p: { id: string; reference: string; nom: string }) => void
}

// Dialog de création complète d'un produit (nom, famille, statut, prix,
// seuil d'alerte, stock initial, description) — réutilisé par les pages
// Composants et Produits finis.
export function ProduitCreateDialog({ open, onOpenChange, defaultStatut = 'Composant', onCreated }: ProduitCreateDialogProps) {
  const [familles, setFamilles] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    nom: '', famille: '', statut: defaultStatut,
    prix_ht: '', seuil_alerte: '', stock_actuel: '0', description: '',
  })

  useEffect(() => {
    if (!open) return
    const sb = createSupabaseClient()
    sb.from('familles').select('nom').order('nom')
      .then(({ data }) => {
        const noms = (data ?? []).map((f: { nom: string }) => f.nom)
        setFamilles(noms)
        getDefaultSeuilAlerte().then((seuil) => {
          setForm({
            nom: '', famille: noms[0] ?? 'Accessoire', statut: defaultStatut,
            prix_ht: '', seuil_alerte: String(seuil), stock_actuel: '0', description: '',
          })
        })
      })
  }, [open, defaultStatut])

  async function handleCreate() {
    if (!form.nom.trim()) {
      toast.error('Nom du produit requis')
      return
    }
    setSaving(true)
    const sb = createSupabaseClient()
    const { data: refData } = await sb.rpc('next_internal_ref')
    const internalRef = (refData as string) ?? `CAD-${Date.now()}`

    const { data, error } = await sb
      .from('produits')
      .insert({
        reference: internalRef,
        nom: form.nom.trim(),
        famille: form.famille,
        statut: form.statut,
        prix_ht: parseFloat(form.prix_ht) || 0,
        stock_actuel: parseInt(form.stock_actuel, 10) || 0,
        seuil_alerte: parseInt(form.seuil_alerte, 10) || 0,
        description: form.description.trim() || null,
      })
      .select('id, reference, nom')
      .single()

    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(`Produit "${data.nom}" créé (${data.reference})`)
    onOpenChange(false)
    onCreated?.(data as { id: string; reference: string; nom: string })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {defaultStatut === 'Produit fini' ? 'Ajouter un produit fini' : 'Ajouter un composant'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nom du produit</Label>
            <Input
              value={form.nom}
              onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
              placeholder="Nom du produit"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Famille</Label>
              <Select value={form.famille} onValueChange={(v) => setForm((f) => ({ ...f, famille: v ?? f.famille }))}>
                <SelectTrigger>{form.famille || 'Famille'}</SelectTrigger>
                <SelectContent>
                  {familles.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Statut</Label>
              <Select value={form.statut} onValueChange={(v) => setForm((f) => ({ ...f, statut: v ?? f.statut }))}>
                <SelectTrigger>{form.statut}</SelectTrigger>
                <SelectContent>
                  {STATUTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Prix HT unitaire</Label>
              <Input
                type="number"
                value={form.prix_ht}
                onChange={(e) => setForm((f) => ({ ...f, prix_ht: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Stock initial</Label>
              <Input
                type="number"
                value={form.stock_actuel}
                onChange={(e) => setForm((f) => ({ ...f, stock_actuel: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Seuil alerte</Label>
              <Input
                type="number"
                value={form.seuil_alerte}
                onChange={(e) => setForm((f) => ({ ...f, seuil_alerte: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Description optionnelle"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleCreate} disabled={saving}>
            <Plus className="h-4 w-4 mr-1" />
            {saving ? 'Création...' : 'Créer le produit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
