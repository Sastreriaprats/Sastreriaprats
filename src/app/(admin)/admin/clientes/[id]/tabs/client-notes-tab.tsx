'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Pin, Lock, Loader2, StickyNote } from 'lucide-react'
import { useAction } from '@/hooks/use-action'
import { usePermissions } from '@/hooks/use-permissions'
import { addClientNote } from '@/actions/clients'
import { formatDateTime } from '@/lib/utils'

const noteTypeLabels: Record<string, string> = {
  general: 'General', boutique_alteration: 'Arreglo boutique', preference: 'Preferencia',
  complaint: 'Queja', compliment: 'Elogio', fitting: 'Prueba', follow_up: 'Seguimiento',
  payment: 'Pago', incident: 'Incidencia',
}
const noteTypeColors: Record<string, string> = {
  general: 'bg-gray-100', preference: 'bg-blue-100', complaint: 'bg-red-100',
  compliment: 'bg-green-100', fitting: 'bg-purple-100', payment: 'bg-amber-100',
  incident: 'bg-red-200', follow_up: 'bg-orange-100', boutique_alteration: 'bg-indigo-100',
}

export function ClientNotesTab({ clientId }: { clientId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const { can } = usePermissions()
  const [notes, setNotes] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ note_type: 'general', title: '', content: '', is_pinned: false, is_private: false })

  const fetchNotes = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data } = await supabase
        .from('client_notes')
        .select('*')
        .eq('client_id', clientId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100)
      if (data) setNotes(data)
    } catch (err) {
      console.error('[ClientNotesTab] fetchNotes error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [supabase, clientId])

  useEffect(() => { fetchNotes() }, [fetchNotes])

  const { execute: submitNote, isLoading: isSaving } = useAction(addClientNote, {
    successMessage: 'Nota añadida',
    onSuccess: () => { setShowForm(false); setForm({ note_type: 'general', title: '', content: '', is_pinned: false, is_private: false }); fetchNotes() },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Notas ({notes.length})</h3>
        {can('clients.edit') && (
          <Button onClick={() => setShowForm(!showForm)} size="sm" className="gap-2 bg-prats-navy hover:bg-prats-navy-light">
            <Plus className="h-4 w-4" /> Nueva nota
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Tipo</Label>
                <Select value={form.note_type} onValueChange={(v) => setForm(p => ({ ...p, note_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(noteTypeLabels).map(([k, v]) => (<SelectItem key={k} value={k}>{v}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Título (opcional)</Label>
                <Input value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2"><Label>Contenido *</Label>
              <Textarea value={form.content} onChange={(e) => setForm(p => ({ ...p, content: e.target.value }))} rows={3} />
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox checked={form.is_pinned} onCheckedChange={(c) => setForm(p => ({ ...p, is_pinned: c as boolean }))} />
                <Label className="text-sm">Fijar arriba</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={form.is_private} onCheckedChange={(c) => setForm(p => ({ ...p, is_private: c as boolean }))} />
                <Label className="text-sm">Nota privada (solo admins)</Label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button size="sm" onClick={() => submitNote({ ...form, client_id: clientId })} disabled={isSaving || !form.content}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Guardar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : notes.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <StickyNote className="mx-auto h-12 w-12 mb-4 opacity-30" />
          <p>No hay notas para este cliente.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <Card key={note.id} className={note.is_pinned ? 'ring-1 ring-amber-300' : ''}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs ${noteTypeColors[note.note_type] || ''}`}>{noteTypeLabels[note.note_type]}</Badge>
                    {note.is_pinned && <Pin className="h-3 w-3 text-amber-500" />}
                    {note.is_private && <Lock className="h-3 w-3 text-muted-foreground" />}
                    {note.title && <span className="font-medium text-sm">{note.title}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDateTime(note.created_at)}</span>
                </div>
                <p className="text-sm mt-2">{note.content}</p>
                <p className="text-xs text-muted-foreground mt-2">Por: {note.created_by_name ?? note.author_name ?? '—'}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
