'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ChartAccountSelect, type ChartAccountOption } from '@/components/accounting/chart-account-select'
import { listChartOfAccountsDetail, createManualJournalEntry, updateManualJournalEntry } from '@/actions/accounting'
import { formatCurrency } from '@/lib/utils'

type LineState = { account_code: string; description: string; debit: string; credit: string }
type InitialEntry = { id: string; entry_number: number; entry_date: string; description: string; lines: { account_code: string; debit: number; credit: number; description: string | null }[] }

const emptyLine = (): LineState => ({ account_code: '', description: '', debit: '', credit: '' })

export function JournalEntryForm({ initial }: { initial?: InitialEntry }) {
  const router = useRouter()
  const editing = !!initial
  const [accounts, setAccounts] = useState<ChartAccountOption[]>([])
  const [date, setDate] = useState(initial?.entry_date ?? new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState(initial?.description ?? '')
  const [lines, setLines] = useState<LineState[]>(
    initial
      ? initial.lines.map((l) => ({ account_code: l.account_code, description: l.description ?? '', debit: l.debit ? String(l.debit) : '', credit: l.credit ? String(l.credit) : '' }))
      : [emptyLine(), emptyLine()],
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listChartOfAccountsDetail().then((r) => { if (r.success) setAccounts(r.data) })
  }, [])

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)
  const balanced = Math.round((totalDebit - totalCredit) * 100) === 0 && totalDebit > 0
  const allHaveAccount = lines.every((l) => l.account_code)
  const canSave = balanced && allHaveAccount && description.trim().length > 0 && lines.length >= 2 && !saving

  const setLine = (i: number, patch: Partial<LineState>) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const addLine = () => setLines((prev) => [...prev, emptyLine()])
  const removeLine = (i: number) => setLines((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)))

  const handleSave = async () => {
    const payloadLines = lines.map((l) => ({ account_code: l.account_code, description: l.description.trim() || null, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0 }))
    setSaving(true)
    const r = editing
      ? await updateManualJournalEntry({ id: initial!.id, date, description: description.trim(), lines: payloadLines })
      : await createManualJournalEntry({ date, description: description.trim(), lines: payloadLines })
    setSaving(false)
    if (r.success) {
      toast.success(editing ? 'Asiento actualizado' : 'Asiento creado')
      router.push('/admin/contabilidad?tab=journal')
    } else {
      toast.error(r.error)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon"><Link href="/admin/contabilidad?tab=journal"><ArrowLeft className="h-5 w-5" /></Link></Button>
        <h1 className="text-2xl font-bold tracking-tight">{editing ? `Editar asiento #${initial!.entry_number}` : 'Nuevo asiento manual'}</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Cabecera</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Fecha</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Descripción</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej: Gasto suelto de mensajería octubre" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Líneas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Cuenta</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead className="text-right w-[110px]">Debe</TableHead>
                <TableHead className="text-right w-[110px]">Haber</TableHead>
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <ChartAccountSelect value={l.account_code || null} accounts={accounts} onChange={(code) => setLine(i, { account_code: code })} />
                  </TableCell>
                  <TableCell>
                    <Input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="(opcional)" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" step="0.01" className="text-right" value={l.debit}
                      onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" step="0.01" className="text-right" value={l.credit}
                      onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-600" disabled={lines.length <= 2} onClick={() => removeLine(i)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Button variant="outline" size="sm" onClick={addLine}><Plus className="h-4 w-4 mr-1" /> Añadir línea</Button>

          <div className="flex items-center justify-end gap-6 border-t pt-3 text-sm">
            <div>Total Debe: <span className="font-semibold tabular-nums">{formatCurrency(totalDebit)}</span></div>
            <div>Total Haber: <span className="font-semibold tabular-nums">{formatCurrency(totalCredit)}</span></div>
            <div className={`font-semibold ${balanced ? 'text-green-600' : 'text-red-600'}`}>
              {balanced ? '✓ Cuadrado' : `Descuadre: ${formatCurrency(totalDebit - totalCredit)}`}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline"><Link href="/admin/contabilidad?tab=journal">Cancelar</Link></Button>
        <Button onClick={handleSave} disabled={!canSave}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{editing ? 'Guardar cambios' : 'Crear asiento'}
        </Button>
      </div>
    </div>
  )
}
