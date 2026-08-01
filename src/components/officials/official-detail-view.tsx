'use client'

/**
 * Vista de detalle de un oficial: prendas bajo su responsabilidad en pedidos
 * vivos, separadas por rol (cortador / oficial) y, dentro de cada rol, entre
 * las que sigue teniendo en confección y las que ya ha terminado.
 *
 * Reutilizado en /admin/oficiales/[id] y /sastre/oficiales/[id]. La prop
 * `basePath` controla los links salientes (vuelta al listado, ir al pedido).
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Scissors, UserCheck, Calendar, ExternalLink, CheckCircle2, Hammer } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  getOfficialInProgressItems,
  type OfficialInProgress,
  type OfficialInProgressItem,
  type OfficialRoleItems,
} from '@/actions/officials'
import { formatDate, getOrderStatusLabel } from '@/lib/utils'

type Props = {
  officialId: string
  /** Base del panel actual. '/admin' o '/sastre'. Sin slash final. */
  basePath: '/admin' | '/sastre'
}

export function OfficialDetailView({ officialId, basePath }: Props) {
  const [data, setData] = useState<OfficialInProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getOfficialInProgressItems(officialId)
      .then((res) => {
        if (cancelled) return
        if (res.success) {
          setData(res.data)
          setError(null)
        } else {
          setError(res.error || 'Error al cargar')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [officialId])

  const listPath = `${basePath}/oficiales`
  const orderPath = (id: string) => `${basePath}/pedidos/${id}`

  if (loading) {
    return (
      <div className="flex items-center justify-center p-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !data || !data.official) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild className="gap-2">
          <Link href={listPath}>
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
        </Button>
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            {error || 'Oficial no encontrado'}
          </CardContent>
        </Card>
      </div>
    )
  }

  const { official, asCortador, asOficial } = data
  const roleTotal = (r: OfficialRoleItems) => r.pending.length + r.finished.length
  const isEmpty = roleTotal(asCortador) === 0 && roleTotal(asOficial) === 0
  const specialties = official.specialty
    ? official.specialty.split(',').map((s) => s.trim()).filter(Boolean)
    : []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={listPath} aria-label="Volver">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{official.name}</h1>
          {specialties.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {specialties.map((s) => (
                <Badge key={s} variant="outline" className="text-xs font-normal">
                  {s}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {isEmpty ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Sin prendas en proceso.
          </CardContent>
        </Card>
      ) : (
        <>
          {roleTotal(asCortador) > 0 && (
            <Section
              icon={<Scissors className="h-4 w-4" />}
              title="Como cortador"
              role={asCortador}
              orderPath={orderPath}
            />
          )}
          {roleTotal(asOficial) > 0 && (
            <Section
              icon={<UserCheck className="h-4 w-4" />}
              title="Como oficial"
              role={asOficial}
              orderPath={orderPath}
            />
          )}
        </>
      )}
    </div>
  )
}

function Section({
  icon, title, role, orderPath,
}: {
  icon: React.ReactNode
  title: string
  role: OfficialRoleItems
  orderPath: (id: string) => string
}) {
  const total = role.pending.length + role.finished.length
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex flex-wrap items-center gap-2">
          {icon}
          {title} ({total})
          <span className="text-xs font-normal text-muted-foreground">
            {role.pending.length} en confección · {role.finished.length} terminada{role.finished.length === 1 ? '' : 's'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <SubSection
          icon={<Hammer className="h-3.5 w-3.5" />}
          label="En confección"
          items={role.pending}
          emptyText="Nada pendiente."
          sectionKey={title}
          orderPath={orderPath}
        />
        <SubSection
          icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
          label="Terminadas"
          items={role.finished}
          emptyText="Ninguna terminada todavía."
          sectionKey={title}
          orderPath={orderPath}
        />
      </CardContent>
    </Card>
  )
}

/**
 * Bloque «En confección» / «Terminadas» dentro de un rol. Se pinta aunque esté
 * vacío para que quede claro que la separación existe (p. ej. "Nada pendiente").
 */
function SubSection({
  icon, label, items, emptyText, sectionKey, orderPath,
}: {
  icon: React.ReactNode
  label: string
  items: OfficialInProgressItem[]
  emptyText: string
  sectionKey: string
  orderPath: (id: string) => string
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label} ({items.length})
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        items.map((it) => (
          <ItemRow key={`${it.line_id}-${sectionKey}-${label}`} item={it} orderPath={orderPath} />
        ))
      )}
    </div>
  )
}

function ItemRow({
  item, orderPath,
}: {
  item: OfficialInProgressItem
  orderPath: (id: string) => string
}) {
  const subtitle = [item.fabric_name, item.model_name].filter(Boolean).join(' · ')
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {/* Estado de la PRENDA (no el del pedido): «Terminado»/«Entregado al
              cliente» pueden convivir con un pedido aún en confección. */}
          <Badge
            variant={item.is_finished ? 'outline' : 'secondary'}
            className={`text-[10px] font-medium ${item.is_finished ? 'border-emerald-600/40 bg-emerald-50 text-emerald-700' : ''}`}
          >
            {getOrderStatusLabel(item.status)}
          </Badge>
          <span className="text-xs text-muted-foreground">{item.days_in_progress} día{item.days_in_progress === 1 ? '' : 's'}</span>
          {item.order_status !== item.status && (
            <span className="text-xs text-muted-foreground/70">· pedido: {getOrderStatusLabel(item.order_status)}</span>
          )}
        </div>
        <p className="mt-1 font-medium">{item.client_name}</p>
        <p className="text-sm text-muted-foreground">
          {item.garment_type}
          {subtitle && <span className="text-muted-foreground/70"> — {subtitle}</span>}
        </p>
      </div>
      <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {item.estimated_delivery_date ? formatDate(item.estimated_delivery_date) : 'Sin fecha'}
        </div>
        <Link
          href={orderPath(item.order_id)}
          className="inline-flex items-center gap-1 text-xs font-mono text-prats-navy hover:text-prats-gold transition-colors"
        >
          {item.order_number}
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  )
}
