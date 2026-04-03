'use client'

import { useEffect, useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'

interface ProduitFini {
  id: string
  reference: string
  nom: string
}

interface FabResult {
  success: boolean
  produit: string
  quantite_fabriquee: number
  composants_mis_a_jour: number
  deficits: { nom: string; stock_apres: number }[]
  alertes: { nom: string; stock_apres: number; seuil: number }[]
  has_deficit: boolean
  has_alerte: boolean
  error?: string
}

interface BomPreview {
  composant_id: string
  reference: string
  nom: string
  quantite_necessaire: number
  stock_actuel: number
  stock_apres: number
  is_deficit: boolean
  is_alerte: boolean
}

export default function FabricationPage() {
  const [produits, setProduits] = useState<ProduitFini[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [quantite, setQuantite] = useState('1')
  const [operateur, setOperateur] = useState('Rafa')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<FabResult | null>(null)
  const [preview, setPreview] = useState<BomPreview[]>([])

  useEffect(() => {
    const sb = createSupabaseClient()
    sb.from('produits')
      .select('id, reference, nom')
      .eq('statut', 'Produit fini')
      .order('nom')
      .then(({ data }) => setProduits(data ?? []))
  }, [])

  useEffect(() => {
    if (!selectedId || !quantite) {
      setPreview([])
      return
    }
    const sb = createSupabaseClient()
    sb.rpc('resolve_bom', {
      p_produit_id: selectedId,
      p_quantite: parseInt(quantite, 10) || 1,
    }).then(({ data }) => setPreview((data as BomPreview[]) ?? []))
  }, [selectedId, quantite])

  async function handleFabrication() {
    if (!selectedId) return
    setLoading(true)
    const sb = createSupabaseClient()
    const { data, error } = await sb.rpc('apply_fabrication', {
      p_produit_id: selectedId,
      p_quantite: parseInt(quantite, 10) || 1,
      p_utilisateur: operateur,
    })

    if (error) {
      toast.error('Erreur: ' + error.message)
    } else {
      const res = data as FabResult
      setResult(res)
      if (res.has_deficit) {
        toast.warning(
          `Fabrication effectuee avec ${res.deficits.length} deficit(s)`
        )
      } else {
        toast.success(
          `Fabrication de ${res.quantite_fabriquee}x ${res.produit} reussie`
        )
      }
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Fabrication</h1>

      <Card>
        <CardHeader>
          <CardTitle>Lancer une fabrication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Produit fini</Label>
              <Select value={selectedId} onValueChange={(v) => setSelectedId(v ?? '')}>
                <SelectTrigger>
                  {selectedId
                    ? produits.find((p) => p.id === selectedId)?.nom ?? 'Choisir un produit'
                    : 'Choisir un produit'}
                </SelectTrigger>
                <SelectContent>
                  {produits.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantite</Label>
              <Input
                type="number"
                min={1}
                value={quantite}
                onChange={(e) => setQuantite(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Operateur</Label>
              <Input
                value={operateur}
                onChange={(e) => setOperateur(e.target.value)}
              />
            </div>
          </div>
          <Button
            onClick={handleFabrication}
            disabled={!selectedId || loading}
          >
            {loading ? 'En cours...' : 'Lancer la fabrication'}
          </Button>
        </CardContent>
      </Card>

      {preview.length > 0 && !result && (
        <Card>
          <CardHeader>
            <CardTitle>Apercu BOM</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Composant</TableHead>
                  <TableHead>Qte requise</TableHead>
                  <TableHead>Stock actuel</TableHead>
                  <TableHead>Stock apres</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((b) => (
                  <TableRow key={b.composant_id}>
                    <TableCell className="font-medium">{b.nom}</TableCell>
                    <TableCell>{b.quantite_necessaire}</TableCell>
                    <TableCell>{b.stock_actuel}</TableCell>
                    <TableCell>
                      <span
                        className={
                          b.is_deficit
                            ? 'text-red-600 font-bold'
                            : b.is_alerte
                              ? 'text-yellow-600 font-bold'
                              : ''
                        }
                      >
                        {b.stock_apres}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>
              Resultat: {result.quantite_fabriquee}x {result.produit}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Composants mis a jour: {result.composants_mis_a_jour}</p>
            {result.deficits.length > 0 && (
              <div className="rounded bg-red-50 p-3 text-red-800">
                <p className="font-bold">Deficits:</p>
                <ul className="list-disc list-inside">
                  {result.deficits.map((d, i) => (
                    <li key={i}>
                      {d.nom}: stock = {d.stock_apres}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.alertes.length > 0 && (
              <div className="rounded bg-yellow-50 p-3 text-yellow-800">
                <p className="font-bold">Alertes:</p>
                <ul className="list-disc list-inside">
                  {result.alertes.map((a, i) => (
                    <li key={i}>
                      {a.nom}: stock = {a.stock_apres} (seuil: {a.seuil})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
