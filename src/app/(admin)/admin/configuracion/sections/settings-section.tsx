'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { bulkUpdateSystemConfigAction } from '@/actions/config'

interface ConfigItem {
  id: string; key: string; value: any; category: string;
  display_name: string; description: string | null;
  value_type: string; is_sensitive: boolean;
}

export function SettingsSection() {
  const supabase = createClient()
  const [configs, setConfigs] = useState<ConfigItem[]>([])
  const [editedValues, setEditedValues] = useState<Record<string, any>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data } = await supabase.from('system_config').select('*').order('category, key')
      if (data) {
        setConfigs(data.map((c: any) => {
          let parsed = c.value
          try { parsed = typeof c.value === 'string' ? JSON.parse(c.value) : c.value } catch {}
          return { ...c, value: parsed }
        }))
      }
    } catch (err) {
      console.error('[SettingsSection] fetchData error:', err)
      toast.error('Error al cargar la configuración del sistema')
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => { fetchData() }, [fetchData])

  const setValue = (key: string, value: any) => {
    setEditedValues(prev => ({ ...prev, [key]: value }))
  }

  const getValue = (config: ConfigItem) => {
    return editedValues[config.key] !== undefined ? editedValues[config.key] : config.value
  }

  const hasChanges = Object.keys(editedValues).length > 0

  const handleSave = async () => {
    setIsSaving(true)
    const updates = Object.entries(editedValues).map(([key, value]) => ({ key, value }))
    const result = await bulkUpdateSystemConfigAction(updates)
    if (result.error) toast.error(result.error)
    else { toast.success(`${updates.length} parámetros actualizados`); setEditedValues({}); fetchData() }
    setIsSaving(false)
  }

  const grouped = configs.reduce((acc, c) => {
    if (!acc[c.category]) acc[c.category] = []
    acc[c.category].push(c)
    return acc
  }, {} as Record<string, ConfigItem[]>)

  const categoryLabels: Record<string, string> = {
    general: 'General', fiscal: 'Fiscal', pos: 'TPV / Caja',
    web: 'Tienda Online', email: 'Email', security: 'Seguridad',
  }

  const renderField = (config: ConfigItem) => {
    const val = getValue(config)
    switch (config.value_type) {
      case 'boolean':
        return <Switch checked={!!val} onCheckedChange={(c) => setValue(config.key, c)} />
      case 'number':
        return <Input type="number" value={val ?? ''} onChange={(e) => setValue(config.key, parseFloat(e.target.value) || 0)} className="max-w-[200px]" />
      case 'string':
        return <Input type={config.is_sensitive ? 'password' : 'text'} value={val ?? ''} onChange={(e) => setValue(config.key, e.target.value)} className="max-w-[300px]" />
      default:
        return <Input value={typeof val === 'object' ? JSON.stringify(val) : (val ?? '')} onChange={(e) => setValue(config.key, e.target.value)} className="max-w-[300px]" />
    }
  }

  return (
    <div className="space-y-6">
      {hasChanges && (
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-lg border bg-amber-50 p-3">
          <span className="text-sm font-medium text-amber-800">Tienes {Object.keys(editedValues).length} cambios sin guardar</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditedValues({})}>Descartar</Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-2 bg-prats-navy hover:bg-prats-navy-light">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar todo
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        Object.entries(grouped).map(([cat, items]) => (
          <Card key={cat}>
            <CardHeader>
              <CardTitle className="text-lg">{categoryLabels[cat] || cat}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.map((config) => (
                <div key={config.key} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{config.display_name}</p>
                    {config.description && <p className="text-xs text-muted-foreground">{config.description}</p>}
                  </div>
                  <div className="ml-4">{renderField(config)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
