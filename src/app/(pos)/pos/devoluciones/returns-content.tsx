'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Search, Loader2, ArrowRightLeft, Ticket, ShoppingBag } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'
import { useAction } from '@/hooks/use-action'
import { createReturn } from '@/actions/pos'
import { formatCurrency, formatDateTime } from '@/lib/utils'

export function ReturnsContent() {
  const router = useRouter()
  const supabase = createClient()
  const { activeStoreId } = useAuth()

  const [ticketSearch, setTicketSearch] = useState('')
  const [foundSale, setFoundSale] = useState<any>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([])
  const [returnType, setReturnType] = useState<'exchange' | 'voucher'>('voucher')
  const [reason, setReason] = useState('')

  const searchSale = async () => {
    if (!ticketSearch) return
    setIsSearching(true)
    const { data } = await supabase.from('sales')
      .select('*, sale_lines(*), clients(full_name)')
      .or(`ticket_number.eq.${ticketSearch},id.eq.${ticketSearch}`)
      .eq('status', 'completed')
      .single()
    if (data) { setFoundSale(data); setSelectedLineIds([]) }
    else toast.error('Ticket no encontrado o ya devuelto')
    setIsSearching(false)
  }

  const toggleLine = (lineId: string) => {
    setSelectedLineIds(prev => prev.includes(lineId) ? prev.filter(id => id !== lineId) : [...prev, lineId])
  }

  const selectedTotal = foundSale?.sale_lines
    ?.filter((l: any) => selectedLineIds.includes(l.id))
    ?.reduce((sum: number, l: any) => sum + l.line_total, 0) || 0

  const { execute, isLoading: isProcessing } = useAction(createReturn, {
    successMessage: returnType === 'voucher' ? 'Vale de devolución generado' : 'Cambio procesado',
    onSuccess: (data: any) => {
      if (data.voucher_code) toast.success(`Código del vale: ${data.voucher_code}`, { duration: 10000 })
      setFoundSale(null); setSelectedLineIds([]); setReason(''); setTicketSearch('')
    },
  })

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 p-4 border-b bg-white">
        <Button variant="ghost" size="icon" onClick={() => router.push('/pos/caja')}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-bold">Devoluciones</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Buscar ticket original</CardTitle></CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Nº de ticket (ej: TK-2026-0001)" className="pl-9"
                    value={ticketSearch} onChange={(e) => setTicketSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchSale()} />
                </div>
                <Button onClick={searchSale} disabled={isSearching || !ticketSearch}>
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {foundSale && (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-mono">{foundSale.ticket_number}</CardTitle>
                    <span className="text-sm text-muted-foreground">{formatDateTime(foundSale.created_at)}</span>
                  </div>
                  {foundSale.clients && <p className="text-sm text-muted-foreground">Cliente: {foundSale.clients.full_name}</p>}
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-semibold mb-3">Selecciona los artículos a devolver:</p>
                  <div className="space-y-2">
                    {foundSale.sale_lines.map((line: any) => {
                      const alreadyReturned = line.quantity_returned > 0
                      return (
                        <div key={line.id} className={`flex items-center gap-3 p-2 rounded border ${alreadyReturned ? 'opacity-40' : ''}`}>
                          <Checkbox checked={selectedLineIds.includes(line.id)} onCheckedChange={() => !alreadyReturned && toggleLine(line.id)} disabled={alreadyReturned} />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{line.description}</p>
                            <p className="text-xs text-muted-foreground">Cant: {line.quantity} &times; {formatCurrency(line.unit_price)}</p>
                          </div>
                          <span className="font-medium text-sm">{formatCurrency(line.line_total)}</span>
                          {alreadyReturned && <Badge variant="destructive" className="text-xs">Ya devuelto</Badge>}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {selectedLineIds.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Procesar devolución</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between text-lg font-bold p-3 bg-muted rounded">
                      <span>Total a devolver</span>
                      <span>{formatCurrency(selectedTotal)}</span>
                    </div>

                    <div className="space-y-2">
                      <Label>Tipo de devolución</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <Button variant={returnType === 'voucher' ? 'default' : 'outline'} className="h-16 flex-col gap-1"
                          onClick={() => setReturnType('voucher')}>
                          <Ticket className="h-5 w-5" /><span className="text-sm">Vale de compra</span>
                          <span className="text-xs opacity-70">Válido 1 año</span>
                        </Button>
                        <Button variant={returnType === 'exchange' ? 'default' : 'outline'} className="h-16 flex-col gap-1"
                          onClick={() => setReturnType('exchange')}>
                          <ShoppingBag className="h-5 w-5" /><span className="text-sm">Cambio directo</span>
                          <span className="text-xs opacity-70">Por otro artículo</span>
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Motivo *</Label>
                      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo de la devolución..." rows={2} />
                    </div>

                    <Button onClick={() => execute({
                      original_sale_id: foundSale.id, return_type: returnType,
                      line_ids: selectedLineIds, reason, store_id: activeStoreId!,
                    })} disabled={isProcessing || !reason} className="w-full h-12 bg-prats-navy hover:bg-prats-navy-light">
                      {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ArrowRightLeft className="mr-2 h-5 w-5" />}
                      {returnType === 'voucher' ? 'Generar vale de devolución' : 'Procesar cambio'}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
