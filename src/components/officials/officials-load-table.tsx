'use client'

/**
 * Tabla simplificada de oficiales para el panel sastre: solo lectura, sin
 * controles de gestión (Switch/Edit/Delete). Reusa los mismos datos de
 * getOfficialsLoad que el listado admin.
 *
 * El badge "En proceso" SÍ es clickable aquí (link al detalle), porque la
 * página /sastre/oficiales/[id] se crea en este mismo commit.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { getOfficialsLoad, type OfficialLoad } from '@/actions/officials'

export function OfficialsLoadTable({ basePath }: { basePath: '/admin' | '/sastre' }) {
  const [items, setItems] = useState<OfficialLoad[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getOfficialsLoad()
      .then((res) => {
        if (cancelled) return
        if (res.success) {
          setItems(res.data)
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
  }, [])

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Nombre</TableHead>
              <TableHead>Especialidad</TableHead>
              <TableHead>En proceso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={3} className="h-32 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-prats-navy" />
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={3} className="h-32 text-center text-destructive">
                  {error}
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                  No hay oficiales activos.
                </TableCell>
              </TableRow>
            ) : (
              items.map((o) => {
                const specialties = o.specialty
                  ? o.specialty.split(',').map((s) => s.trim()).filter(Boolean)
                  : []
                return (
                  <TableRow key={o.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{o.name}</TableCell>
                    <TableCell className="text-sm">
                      {specialties.length === 0 ? '—' : (
                        <div className="flex flex-wrap gap-1">
                          {specialties.map((s) => (
                            <Badge key={s} variant="outline" className="text-xs font-normal whitespace-nowrap">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {o.total === 0 ? (
                        <Badge variant="outline" className="text-xs font-normal text-muted-foreground">0</Badge>
                      ) : (
                        <Link
                          href={`${basePath}/oficiales/${o.id}`}
                          className="inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-prats-navy text-white hover:bg-prats-navy/80 transition-colors min-w-[2rem]"
                          title={`${o.asCortador} como cortador · ${o.asOficial} como oficial`}
                        >
                          {o.total}
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
