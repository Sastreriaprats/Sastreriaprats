'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, Plus, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  listAccessGrants, searchUsers, grantUserScope, revokeUserScope, removeUserAccess, getMyAccess,
} from '@/actions/ops'
import type { AccessRow, Scope } from '@/lib/ops/db'
import { PageHeader } from '../accounting-ui'

type UserAccess = { userId: string; email: string; fullName: string; scopes: Scope[] }

const SCOPE_LABEL: Record<Scope, string> = { B: 'Efectivo', C: 'Escenario' }

function group(rows: AccessRow[]): UserAccess[] {
  const byUser = new Map<string, UserAccess>()
  for (const r of rows) {
    const u = byUser.get(r.userId) ?? { userId: r.userId, email: r.email, fullName: r.fullName, scopes: [] }
    u.scopes.push(r.scope)
    byUser.set(r.userId, u)
  }
  return [...byUser.values()].sort((a, b) => a.fullName.localeCompare(b.fullName))
}

// Chip clicable de capa: activo (navy + check) ↔ inactivo (gris + "+").
function ScopeChip({ scope, active, disabled, onToggle }: {
  scope: Scope; active: boolean; disabled: boolean; onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      title={active ? `Quitar capa ${SCOPE_LABEL[scope]}` : `Dar capa ${SCOPE_LABEL[scope]}`}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
        active
          ? 'border-prats-navy bg-prats-navy text-white hover:bg-prats-navy-light'
          : 'border-dashed border-slate-300 bg-white text-slate-400 hover:border-slate-400 hover:text-slate-600'
      }`}
    >
      {active ? <Check className="h-3 w-3 text-prats-gold" /> : <Plus className="h-3 w-3" />}
      {SCOPE_LABEL[scope]}
    </button>
  )
}

export function AccessManager() {
  const [users, setUsers] = useState<UserAccess[]>([])
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyUser, setBusyUser] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ id: string; email: string; fullName: string }[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const [res, me] = await Promise.all([listAccessGrants(), getMyAccess()])
    setUsers(res.ok ? group(res.data) : [])
    setMyUserId(me.userId)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    let active = true
    const t = setTimeout(async () => {
      const res = await searchUsers(q)
      if (active) setResults(res.ok ? res.data : [])
    }, 300)
    return () => { active = false; clearTimeout(t) }
  }, [q])

  const run = async (userId: string, fn: () => Promise<{ ok: boolean } & { error?: string }>, okMsg: string) => {
    setBusyUser(userId)
    const res = await fn()
    setBusyUser(null)
    if (res.ok) { toast.success(okMsg); setQ(''); setResults([]); load() }
    else toast.error(res.error || 'Error')
  }

  const toggle = (u: UserAccess, scope: Scope) => {
    const has = u.scopes.includes(scope)
    if (has && scope === 'B' && u.userId === myUserId) {
      if (!window.confirm('Vas a quitarte a TI MISMO la capa Efectivo: perderás el acceso a esta pantalla de gestión. ¿Seguro?')) return
    }
    if (has) run(u.userId, () => revokeUserScope(u.userId, scope), `Capa ${SCOPE_LABEL[scope]} retirada`)
    else run(u.userId, () => grantUserScope(u.userId, scope), `Capa ${SCOPE_LABEL[scope]} concedida`)
  }

  const removeAll = (u: UserAccess) => {
    const self = u.userId === myUserId
    const msg = self
      ? 'Vas a eliminar TU PROPIO acceso a Tesorería (todas las capas). Perderás la entrada al panel. ¿Seguro?'
      : `¿Eliminar todo el acceso de ${u.fullName || u.email}? Dejará de ver el panel de Tesorería por completo.`
    if (!window.confirm(msg)) return
    run(u.userId, () => removeUserAccess(u.userId), 'Acceso eliminado')
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Accesos" subtitle="Quién puede ver cada vista interna de Tesorería" />

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-medium mb-2">Conceder acceso a un usuario</p>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o email…" />
        {results.length > 0 && (
          <div className="mt-2 divide-y rounded-md border">
            {results.map((u) => (
              <div key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="flex-1">{u.fullName} <span className="text-slate-400">· {u.email}</span></span>
                <Button size="sm" variant="outline" onClick={() => run(u.id, () => grantUserScope(u.id, 'B'), 'Capa Efectivo concedida')}>+ Efectivo</Button>
                <Button size="sm" variant="outline" onClick={() => run(u.id, () => grantUserScope(u.id, 'C'), 'Capa Escenario concedida')}>+ Escenario</Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-4 py-3">Usuario</th>
              <th className="text-left px-4 py-3">Capas (pulsa para dar o quitar)</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">Cargando…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">Nadie tiene acceso todavía.</td></tr>
            ) : users.map((u) => {
              const busy = busyUser === u.userId
              return (
                <tr key={u.userId} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2.5">
                    {u.fullName || <span className="italic text-slate-400">Sin nombre</span>}
                    <span className="text-slate-400"> · {u.email}</span>
                    {u.userId === myUserId && <span className="ml-2 rounded bg-prats-beige-light px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-prats-gold">Tú</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {(['B', 'C'] as Scope[]).map((s) => (
                        <ScopeChip
                          key={s}
                          scope={s}
                          active={u.scopes.includes(s)}
                          disabled={busy}
                          onToggle={() => toggle(u, s)}
                        />
                      ))}
                      {busy && <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-slate-400" />}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => removeAll(u)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                      title="Eliminar todo el acceso de este usuario"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar acceso
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        Quien tiene la capa &quot;Efectivo&quot; puede gestionar estos accesos. No se puede quitar la capa Efectivo al último gestor
        (el panel quedaría sin administrador).
      </p>
    </div>
  )
}
