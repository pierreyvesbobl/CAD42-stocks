'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Product {
  id: string
  reference: string
  nom: string
  description: string | null
  famille: string | null
  statut: string | null
}

interface ProductComboboxProps {
  products: Product[]
  selectedId: string
  onSelect: (id: string) => void
  onCreateNew: () => void
}

export function ProductCombobox({
  products,
  selectedId,
  onSelect,
  onCreateNew,
}: ProductComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, openUp: false })

  const selected = products.find((p) => p.id === selectedId)

  const filtered = search.trim()
    ? products.filter((p) => {
        const s = search.toLowerCase()
        return p.nom.toLowerCase().includes(s) || p.reference.toLowerCase().includes(s) || (p.description ?? '').toLowerCase().includes(s)
      })
    : products

  const DROPDOWN_HEIGHT = 300

  const updatePosition = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const openUp = spaceBelow < DROPDOWN_HEIGHT && rect.top > spaceBelow
      setPos({
        top: openUp ? rect.top : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        openUp,
      })
    }
  }, [])

  useEffect(() => {
    if (!open) return
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      )
        return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="w-full">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen(!open)
          setSearch('')
        }}
        className={cn(
          'flex w-full items-center justify-between rounded-lg border border-input bg-transparent px-3 py-2 text-sm h-9 transition-colors hover:bg-muted/50',
          !selected && 'text-muted-foreground'
        )}
      >
        <span className="truncate">
          {selected ? selected.nom : 'Choisir un produit...'}
        </span>
        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
      </button>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] rounded-lg border bg-popover shadow-lg"
            style={{
              ...(pos.openUp
                ? { bottom: window.innerHeight - pos.top + 4, left: pos.left, width: pos.width }
                : { top: pos.top, left: pos.left, width: pos.width }),
            }}
          >
            <div className="p-2 border-b">
              <Input
                placeholder="Rechercher..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8"
                autoFocus
              />
            </div>
            <div className="max-h-56 overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-sm text-muted-foreground mb-2">
                    Aucun produit trouvé
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setOpen(false)
                      onCreateNew()
                    }}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Créer un nouveau produit
                  </Button>
                </div>
              ) : (
                <>
                  {filtered.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer',
                        selectedId === p.id && 'bg-accent'
                      )}
                      onClick={() => {
                        onSelect(p.id)
                        setOpen(false)
                      }}
                    >
                      <Check
                        className={cn(
                          'h-3.5 w-3.5 shrink-0',
                          selectedId === p.id ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <div className="flex-1 min-w-0 text-left">
                        <span className="block truncate">{p.nom}</span>
                        {p.description && (
                          <span className="block text-xs text-muted-foreground truncate">{p.description}</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {p.reference} — {p.famille}
                        </span>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
            <div className="border-t p-1">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-blue-600 hover:bg-accent cursor-pointer"
                onClick={() => {
                  setOpen(false)
                  onCreateNew()
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="font-medium">Créer un nouveau produit</span>
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
