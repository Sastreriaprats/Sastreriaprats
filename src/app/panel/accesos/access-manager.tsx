'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  listAccessGrants, searchUsers, grantUserScope, revokeUserScope,
} from '@/actions/ops'
import type { AccessRow, Scope } from '@/lib/ops/db'

type UserAccess = { userId: string; email: string; fullName: string; scopes: Scope[] }

function group(rows: AccessRow[]): UserAccess[] {
  const byUser = new Map<string, UserAccess>()
  for (const r of rows) {
    const u = byUser.get(r.userId) ?? { userId: r.userId, email: r.email, fullName: r.fullName, scopes: [] }
    u.scopes.push(r.scope)
    byUser.set(r.userId, u)
  }
  return [...byUser.values()].sort((a, b) => a.fullName.localeCompare(b.fullName))
}

export function AccessManager() {
  const [users, setUsers] = useState<UserAccess[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ id: string; email: string; fullName: string }[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await listAccessGrants()
    setUsers(res.ok ? group(res.data) : [])
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

  const grant = async (userId: string, scope: Scope) => {
    const res = await grantUserScope(userId, scope)
    if (res.ok) { toast.success('Acceso concedido'); setQ(''); setResults([]); load() }
    else toast.error('Error')
  }
  const revoke = async (userId: string, scope: Scope) => {
    const res = await revokeUserScope(userId, scope)
    if (res.ok) { toast.success('Acceso retirado'); load() }
    else toast.error('Error')
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">Accesos a las vistas internas</h1>

      <div className="rounded-lg border bg-white p-4">
        <p className="text-sm font-medium mb-2">Conceder acceso a un usuario</p>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o email…" />
        {results.length > 0 && (
          <div className="mt-2 divide-y rounded-md border">
            {results.map((u) => (
              <div key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="flex-1">{u.fullName} <span className="text-slate-400">· {u.email}</span></span>
                <Button size="sm" variant="outline" onClick={() => grant(u.id, 'B')}>+ Efectivo (B)</Button>
                <Button size="sm" variant="outline" onClick={() => grant(u.id, 'C')}>+ Escenario (C)</Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left font-medium px-4 py-2">Usuario</th>
              <th className="text-left font-medium px-4 py-2">Capas</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">Cargando…</td></tr>
            ) : users.map((u) => (
              <tr key={u.userId} className="border-t">
                <td className="px-4 py-2">{u.fullName} <span className="text-slate-400">· {u.email}</span></td>
                <td className="px-4 py-2">
                  <div className="flex gap-1">
                    {(['B', 'C'] as Scope[]).map((s) => (
                      <span key={s} className={`px-2 py-0.5 rounded text-xs ${u.scopes.includes(s) ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-400'}`}>
                        {s === 'B' ? 'Efectivo' : 'Escenario'}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex gap-1 justify-end">
                    {(['B', 'C'] as Scope[]).map((s) => (
                      u.scopes.includes(s)
                        ? <button key={s} onClick={() => revoke(u.userId, s)} className="text-xs text-red-600 hover:underline">− {s}</button>
                        : <button key={s} onClick={() => grant(u.userId, s)} className="text-xs text-emerald-600 hover:underline">+ {s}</button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">Quien tiene la capa "Efectivo" (B) puede gestionar estos accesos.</p>
    </div>
  )
}
