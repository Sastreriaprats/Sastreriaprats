'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Percent, Plus, Pencil, Trash2, Loader2, Users, Star } from 'lucide-react'
import { toast } from 'sonner'
import {
  getCommissionConfig, upsertCommissionPlan, deleteCommissionPlan, assignCommissionPlan,
  upsertGroupBonus, deleteGroupBonus,
  type CommissionPlan, type CommissionAssignment, type GroupBonus,
} from '@/actions/commissions'

type Config = {
  plans: CommissionPlan[]
  assignments: CommissionAssignment[]
  bonuses: GroupBonus[]
  stores: { id: string; name: string }[]
  employees: { id: string; full_name: string }[]
}

const emptyPlan = (): CommissionPlan => ({
  id: '', name: '', store_id: null,
  base_boutique: true, base_gift_cards: false, base_sastreria: false,
  rate_below: 0, rate_above: 0, use_target: true, is_active: true,
})

const emptyBonus = (): GroupBonus => ({
  id: '', name: '', period_type: 'quarter', rate: 0, base_type: 'excess',
  goal_types: ['boutique', 'sastreria'], is_active: true, store_ids: [], member_ids: [],
})

export function CommissionsSection() {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [planDraft, setPlanDraft] = useState<CommissionPlan | null>(null)
  const [bonusDraft, setBonusDraft] = useState<GroupBonus | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getCommissionConfig()
    if (res.error) { toast.error(res.error); setConfig(null) }
    else setConfig(res.data!)
    setLoading(false)
  }, [])

  // Carga inicial: setState solo tras el await (no síncrono dentro del efecto).
  useEffect(() => {
    let alive = true
    getCommissionConfig().then(res => {
      if (!alive) return
      if (res.error) { toast.error(res.error); setConfig(null) }
      else setConfig(res.data!)
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  const assignedPlanFor = (employeeId: string) => config?.assignments.find(a => a.employee_id === employeeId)?.plan_id ?? ''

  const savePlan = async () => {
    if (!planDraft) return
    setSaving(true)
    const res = await upsertCommissionPlan({
      id: planDraft.id || undefined,
      name: planDraft.name,
      store_id: planDraft.store_id,
      base_boutique: planDraft.base_boutique,
      base_gift_cards: planDraft.base_gift_cards,
      base_sastreria: planDraft.base_sastreria,
      rate_below: planDraft.rate_below,
      rate_above: planDraft.rate_above,
      use_target: planDraft.use_target,
      is_active: planDraft.is_active,
    })
    setSaving(false)
    if (res.error) { toast.error(res.error); return }
    toast.success('Plan guardado')
    setPlanDraft(null)
    load()
  }

  const removePlan = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar el plan "${name}"? Los empleados asignados quedarán sin comisión.`)) return
    const res = await deleteCommissionPlan(id)
    if (res.error) { toast.error(res.error); return }
    toast.success('Plan eliminado')
    load()
  }

  const changeAssignment = async (employeeId: string, planId: string) => {
    const res = await assignCommissionPlan({ employee_id: employeeId, plan_id: planId || null })
    if (res.error) { toast.error(res.error); return }
    toast.success('Asignación actualizada')
    load()
  }

  const saveBonus = async () => {
    if (!bonusDraft) return
    if (bonusDraft.store_ids.length === 0) { toast.error('Selecciona al menos una tienda'); return }
    if (bonusDraft.member_ids.length === 0) { toast.error('Selecciona al menos un empleado beneficiario'); return }
    setSaving(true)
    const res = await upsertGroupBonus({
      id: bonusDraft.id || undefined,
      name: bonusDraft.name,
      rate: bonusDraft.rate,
      base_type: bonusDraft.base_type,
      goal_types: bonusDraft.goal_types,
      period_type: bonusDraft.period_type,
      is_active: bonusDraft.is_active,
      store_ids: bonusDraft.store_ids,
      member_ids: bonusDraft.member_ids,
    })
    setSaving(false)
    if (res.error) { toast.error(res.error); return }
    toast.success('Bonus guardado')
    setBonusDraft(null)
    load()
  }

  const removeBonus = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar el bonus grupal "${name}"?`)) return
    const res = await deleteGroupBonus(id)
    if (res.error) { toast.error(res.error); return }
    toast.success('Bonus eliminado')
    load()
  }

  if (loading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}</div>
  }
  if (!config) return <p className="text-muted-foreground">No se pudo cargar la configuración de comisiones.</p>

  const baseLabels = (p: CommissionPlan) => {
    const out: string[] = []
    if (p.base_boutique) out.push('Boutique')
    if (p.base_gift_cards) out.push('Tarjetas')
    if (p.base_sastreria) out.push('Sastrería')
    return out.length ? out.join(' + ') : '—'
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        Las comisiones se calculan sobre la venta del empleado <strong>sin IVA</strong>, medida igual que los
        <strong> Objetivos</strong> (por vendedor). El tramo &ldquo;sobre objetivo&rdquo; usa el objetivo
        <strong> individual</strong> de cada empleado (Configuración → Objetivos), separado Boutique/Sastrería.
        Define aquí los planes, asígnalos a cada empleado y configura el bonus grupal.
      </div>

      {/* ── Planes ─────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Percent className="h-4 w-4" /> Planes de comisión</CardTitle>
          <Button size="sm" className="gap-1" onClick={() => setPlanDraft(emptyPlan())}><Plus className="h-3 w-3" /> Nuevo plan</Button>
        </CardHeader>
        <CardContent>
          {config.plans.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Aún no hay planes. Crea uno (p.ej. &ldquo;Wellington&rdquo; 1% / 1,5%).</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Base</TableHead>
                  <TableHead className="text-right">% bajo objetivo</TableHead>
                  <TableHead className="text-right">% sobre objetivo</TableHead>
                  <TableHead>Objetivo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {config.plans.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{baseLabels(p)}</TableCell>
                    <TableCell className="text-right">{p.rate_below}%</TableCell>
                    <TableCell className="text-right">{p.use_target ? `${p.rate_above}%` : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>{p.use_target ? <Badge variant="outline">Por tramos</Badge> : <Badge variant="secondary">Plana</Badge>}</TableCell>
                    <TableCell>{p.is_active ? <Badge>Activo</Badge> : <Badge variant="outline">Inactivo</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setPlanDraft({ ...p })}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => removePlan(p.id, p.name)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Asignación ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Asignación por empleado</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Empleado</TableHead><TableHead className="w-64">Plan de comisión</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {config.employees.map(emp => (
                <TableRow key={emp.id}>
                  <TableCell className="font-medium">{emp.full_name}</TableCell>
                  <TableCell>
                    <Select value={assignedPlanFor(emp.id) || 'none'} onValueChange={v => changeAssignment(emp.id, v === 'none' ? '' : v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin comisión</SelectItem>
                        {config.plans.filter(p => p.is_active).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Bonus grupal ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Star className="h-4 w-4" /> Bonus grupal</CardTitle>
          <Button size="sm" className="gap-1" onClick={() => setBonusDraft(emptyBonus())}><Plus className="h-3 w-3" /> Nuevo bonus</Button>
        </CardHeader>
        <CardContent>
          {config.bonuses.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Sin bonus grupales. Ejemplo: trimestral, si Wellington y Pinzón superan objetivo, 1,5% del exceso repartido entre Elena y Dario.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead><TableHead>Periodo</TableHead><TableHead className="text-right">%</TableHead>
                  <TableHead>Base</TableHead><TableHead>Tiendas</TableHead><TableHead>Beneficiarios</TableHead><TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {config.bonuses.map(b => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{b.period_type === 'quarter' ? 'Trimestral' : b.period_type === 'month' ? 'Mensual' : 'Anual'}</TableCell>
                    <TableCell className="text-right">{b.rate}%</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{b.base_type === 'total' ? 'Venta conjunta' : 'Exceso conjunto'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{b.store_ids.length}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{b.member_ids.length}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setBonusDraft({ ...b })}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => removeBonus(b.id, b.name)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Diálogo de plan ────────────────────────────────────────────────── */}
      <Dialog open={!!planDraft} onOpenChange={o => { if (!o) setPlanDraft(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{planDraft?.id ? 'Editar plan' : 'Nuevo plan'}</DialogTitle></DialogHeader>
          {planDraft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nombre</Label>
                <Input value={planDraft.name} onChange={e => setPlanDraft({ ...planDraft, name: e.target.value })} placeholder="Wellington" />
              </div>
              <div className="space-y-1.5">
                <Label>Tienda (informativo, opcional)</Label>
                <Select value={planDraft.store_id ?? 'none'} onValueChange={v => setPlanDraft({ ...planDraft, store_id: v === 'none' ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Ninguna —</SelectItem>
                    {config.stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Base de la comisión (sin IVA)</Label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={planDraft.base_boutique} onCheckedChange={c => setPlanDraft({ ...planDraft, base_boutique: !!c })} /> Boutique</label>
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={planDraft.base_gift_cards} onCheckedChange={c => setPlanDraft({ ...planDraft, base_gift_cards: !!c })} /> Tarjetas regalo</label>
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={planDraft.base_sastreria} onCheckedChange={c => setPlanDraft({ ...planDraft, base_sastreria: !!c })} /> Sastrería (vendida en TPV)</label>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label className="cursor-pointer">Aplicar objetivo (tramos)</Label>
                  <p className="text-[11px] text-muted-foreground">Si lo desactivas, el % bajo se aplica a TODA la base (tarifa plana).</p>
                </div>
                <Switch checked={planDraft.use_target} onCheckedChange={c => setPlanDraft({ ...planDraft, use_target: c })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>% {planDraft.use_target ? 'bajo objetivo' : '(plano)'}</Label>
                  <Input type="number" step="0.01" value={planDraft.rate_below} onChange={e => setPlanDraft({ ...planDraft, rate_below: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label className={planDraft.use_target ? '' : 'text-muted-foreground'}>% sobre objetivo</Label>
                  <Input type="number" step="0.01" disabled={!planDraft.use_target} value={planDraft.rate_above} onChange={e => setPlanDraft({ ...planDraft, rate_above: Number(e.target.value) })} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={planDraft.is_active} onCheckedChange={c => setPlanDraft({ ...planDraft, is_active: !!c })} /> Plan activo</label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDraft(null)}>Cancelar</Button>
            <Button onClick={savePlan} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo de bonus ───────────────────────────────────────────────── */}
      <Dialog open={!!bonusDraft} onOpenChange={o => { if (!o) setBonusDraft(null) }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{bonusDraft?.id ? 'Editar bonus grupal' : 'Nuevo bonus grupal'}</DialogTitle></DialogHeader>
          {bonusDraft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nombre</Label>
                <Input value={bonusDraft.name} onChange={e => setBonusDraft({ ...bonusDraft, name: e.target.value })} placeholder="Bonus trimestral tiendas" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Periodo</Label>
                  <Select value={bonusDraft.period_type} onValueChange={v => setBonusDraft({ ...bonusDraft, period_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quarter">Trimestral</SelectItem>
                      <SelectItem value="month">Mensual</SelectItem>
                      <SelectItem value="year">Anual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>% a repartir</Label>
                  <Input type="number" step="0.01" value={bonusDraft.rate} onChange={e => setBonusDraft({ ...bonusDraft, rate: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Base del %</Label>
                <Select value={bonusDraft.base_type} onValueChange={v => setBonusDraft({ ...bonusDraft, base_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="excess">Sobre el exceso conjunto (actual − objetivo)</SelectItem>
                    <SelectItem value="total">Sobre la venta conjunta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Qué cuenta para el objetivo</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={bonusDraft.goal_types.includes('boutique')} onCheckedChange={c => setBonusDraft({ ...bonusDraft, goal_types: toggle(bonusDraft.goal_types, 'boutique', !!c) })} /> Boutique</label>
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={bonusDraft.goal_types.includes('sastreria')} onCheckedChange={c => setBonusDraft({ ...bonusDraft, goal_types: toggle(bonusDraft.goal_types, 'sastreria', !!c) })} /> Sastrería</label>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tiendas que TODAS deben superar objetivo</Label>
                <div className="grid grid-cols-2 gap-2">
                  {config.stores.map(s => (
                    <label key={s.id} className="flex items-center gap-2 text-sm"><Checkbox checked={bonusDraft.store_ids.includes(s.id)} onCheckedChange={c => setBonusDraft({ ...bonusDraft, store_ids: toggle(bonusDraft.store_ids, s.id, !!c) })} /> {s.name}</label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Beneficiarios (reparto a partes iguales)</Label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto rounded-md border p-2">
                  {config.employees.map(emp => (
                    <label key={emp.id} className="flex items-center gap-2 text-sm"><Checkbox checked={bonusDraft.member_ids.includes(emp.id)} onCheckedChange={c => setBonusDraft({ ...bonusDraft, member_ids: toggle(bonusDraft.member_ids, emp.id, !!c) })} /> {emp.full_name}</label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={bonusDraft.is_active} onCheckedChange={c => setBonusDraft({ ...bonusDraft, is_active: !!c })} /> Bonus activo</label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBonusDraft(null)}>Cancelar</Button>
            <Button onClick={saveBonus} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function toggle(arr: string[], value: string, on: boolean): string[] {
  if (on) return arr.includes(value) ? arr : [...arr, value]
  return arr.filter(v => v !== value)
}
