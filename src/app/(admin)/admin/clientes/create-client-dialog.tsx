'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs'
import { Loader2 } from 'lucide-react'
import { useAction } from '@/hooks/use-action'
import { createClientAction } from '@/actions/clients'

// Nacionalidades: Española primero, resto en orden alfabético
const NATIONALITIES = [
  'Española',
  'Afgana', 'Albanesa', 'Alemana', 'Andorrana', 'Angoleña', 'Argentina', 'Armenia', 'Australiana', 'Austriaca', 'Azerbaiyana',
  'Bahreiní', 'Bangladesí', 'Belga', 'Beliceña', 'Bielorrusa', 'Boliviana', 'Bosnia', 'Botsuanesa', 'Brasileña', 'Británica', 'Búlgara', 'Burundesa',
  'Camboyana', 'Camerunesa', 'Canadiense', 'Catarí', 'Checa', 'Chilena', 'China', 'Colombiana', 'Congoleña', 'Costarricense', 'Croata', 'Cubana',
  'Danesa', 'Dominicana',
  'Ecuatoriana', 'Egipcia', 'Salvadoreña', 'Emiratí', 'Eritrea', 'Escocesa', 'Eslovaca', 'Eslovena', 'Estadounidense', 'Estonia', 'Etíope',
  'Filipina', 'Finlandesa', 'Francesa',
  'Galesa', 'Gambiana', 'Georgiana', 'Ghanesa', 'Griega', 'Guatemalteca', 'Guineana', 'Guineana ecuatorial', 'Guyanesa',
  'Haitiana', 'Holandesa', 'Hondureña', 'Húngara',
  'India', 'Indonesa', 'Iraní', 'Iraquí', 'Irlandesa', 'Islandesa', 'Israelí', 'Italiana',
  'Jamaicana', 'Japonesa', 'Jordana', 'Kazaja', 'Keniata', 'Kirguisa', 'Kosovar', 'Kuwaití',
  'Laosiana', 'Lesotensa', 'Letona', 'Líbana', 'Liberiana', 'Libia', 'Liechtensteiniana', 'Lituana', 'Luxemburguesa',
  'Macedonia', 'Malasia', 'Malaui', 'Maldiva', 'Maliense', 'Maltesa', 'Marroquí', 'Mauritana', 'Mauriciana', 'Mexicana', 'Moldava', 'Monegasca', 'Mongola', 'Montenegrina', 'Mozambiqueña',
  'Namibia', 'Nepalí', 'Nicaragüense', 'Nigeriana', 'Nigerina', 'Noruega', 'Neozelandesa',
  'Omaní',
  'Pakistaní', 'Palestina', 'Panameña', 'Papú', 'Paraguaya', 'Peruana', 'Polaca', 'Portuguesa', 'Puertorriqueña',
  'Qatarí',
  'Británica', 'Rumana', 'Rusa', 'Ruandesa',
  'Samoana', 'Saudí', 'Senegalesa', 'Serbia', 'Seychellense', 'Sierraleonesa', 'Singapurense', 'Siria', 'Somalí', 'Sudafricana', 'Sudanesa', 'Sueca', 'Suiza', 'Surinamesa',
  'Tailandesa', 'Taiwanesa', 'Tanzana', 'Tayika', 'Timorense', 'Togolesa', 'Tongana', 'Trinitense', 'Tunecina', 'Turca', 'Turkmena',
  'Ucraniana', 'Ugandesa', 'Uruguaya', 'Uzbeka',
  'Vanuatuense', 'Venezolana', 'Vietnamita',
  'Yemení',
  'Zambiana', 'Zimbabuense',
]

const MONTHS = [
  { value: '01', label: 'Enero' }, { value: '02', label: 'Febrero' }, { value: '03', label: 'Marzo' }, { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' }, { value: '06', label: 'Junio' }, { value: '07', label: 'Julio' }, { value: '08', label: 'Agosto' },
  { value: '09', label: 'Septiembre' }, { value: '10', label: 'Octubre' }, { value: '11', label: 'Noviembre' }, { value: '12', label: 'Diciembre' },
]

const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: currentYear - 1930 + 1 }, (_, i) => currentYear - i)

interface CreateClientDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function CreateClientDialog({ open, onOpenChange, onSuccess }: CreateClientDialogProps) {
  const [activeTab, setActiveTab] = useState('personal')
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', phone_secondary: '',
    date_of_birth: '', gender: 'male' as 'male' | 'female',
    client_type: 'individual', category: 'standard',
    document_type: 'DNI', document_number: '',
    company_name: '', company_nif: '',
    address: '', city: 'Madrid', postal_code: '', province: 'Madrid', country: 'España',
    nationality: 'Española',
    source: '', discount_percentage: 0,
    accepts_marketing: false, accepts_data_storage: false,
    internal_notes: '',
    standard_sizes: {} as Record<string, string>,
  })

  const { execute, isLoading } = useAction(createClientAction, {
    successMessage: 'Cliente creado correctamente',
    onSuccess: () => { onOpenChange(false); resetForm(); onSuccess() },
  })

  const resetForm = () => setForm({
    first_name: '', last_name: '', email: '', phone: '', phone_secondary: '',
    date_of_birth: '', gender: 'male', client_type: 'individual', category: 'standard',
    document_type: 'DNI', document_number: '', company_name: '', company_nif: '',
    address: '', city: 'Madrid', postal_code: '', province: 'Madrid', country: 'España',
    nationality: 'Española', source: '', discount_percentage: 0,
    accepts_marketing: false, accepts_data_storage: false, internal_notes: '',
    standard_sizes: {},
  })

  const set = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }))

  const { birthDay, birthMonth, birthYear } = useMemo(() => {
    if (!form.date_of_birth || form.date_of_birth.length < 10) {
      return { birthDay: '', birthMonth: '', birthYear: '' }
    }
    const [y, m, d] = form.date_of_birth.split('-')
    return { birthDay: d, birthMonth: m, birthYear: y }
  }, [form.date_of_birth])

  const setBirthDate = (day: string, month: string, year: string) => {
    const hasDay = day != null && String(day).trim() !== ''
    const hasMonth = month != null && String(month).trim() !== ''
    const hasYear = year != null && String(year).trim() !== ''
    if (hasDay && hasMonth && hasYear) {
      const d = String(day).padStart(2, '0')
      const m = String(month).padStart(2, '0')
      set('date_of_birth', `${year}-${m}-${d}`)
    } else {
      set('date_of_birth', null as unknown as string)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="personal">Personal</TabsTrigger>
            <TabsTrigger value="contact">Contacto</TabsTrigger>
            <TabsTrigger value="preferences">Preferencias</TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Nombre *</Label><Input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} /></div>
              <div className="space-y-2"><Label>Apellidos *</Label><Input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Tipo</Label>
                <Select value={form.client_type} onValueChange={(v) => set('client_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Particular</SelectItem>
                    <SelectItem value="company">Empresa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Categoría</Label>
                <Select value={form.category} onValueChange={(v) => set('category', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Estándar</SelectItem>
                    <SelectItem value="vip">VIP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Fecha nacimiento</Label>
                <div className="flex gap-2">
                  <Select value={birthDay} onValueChange={(v) => setBirthDate(v, birthMonth, birthYear)}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Día" /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 31 }, (_, i) => {
                        const d = String(i + 1).padStart(2, '0')
                        return <SelectItem key={d} value={d}>{i + 1}</SelectItem>
                      })}
                    </SelectContent>
                  </Select>
                  <Select value={birthMonth} onValueChange={(v) => setBirthDate(birthDay, v, birthYear)}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Mes" /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={birthYear} onValueChange={(v) => setBirthDate(birthDay, birthMonth, v)}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Año" /></SelectTrigger>
                    <SelectContent>
                      {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2"><Label>Género</Label>
                <Select value={form.gender} onValueChange={(v) => set('gender', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Masculino</SelectItem>
                    <SelectItem value="female">Femenino</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Nacionalidad</Label>
                <Select value={form.nationality} onValueChange={(v) => set('nationality', v)}>
                  <SelectTrigger><SelectValue placeholder="Nacionalidad" /></SelectTrigger>
                  <SelectContent>
                    {NATIONALITIES.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.client_type === 'company' && (
              <div className="grid grid-cols-2 gap-4 p-3 rounded-lg border bg-muted/30">
                <div className="space-y-2"><Label>Empresa</Label><Input value={form.company_name} onChange={(e) => set('company_name', e.target.value)} /></div>
                <div className="space-y-2"><Label>NIF/CIF empresa</Label><Input value={form.company_nif} onChange={(e) => set('company_nif', e.target.value)} /></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Documento</Label>
                <Select value={form.document_type} onValueChange={(v) => set('document_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DNI">DNI</SelectItem>
                    <SelectItem value="NIE">NIE</SelectItem>
                    <SelectItem value="NIF">NIF</SelectItem>
                    <SelectItem value="CIF">CIF</SelectItem>
                    <SelectItem value="passport">Pasaporte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Número documento</Label><Input value={form.document_number} onChange={(e) => set('document_number', e.target.value)} /></div>
            </div>
          </TabsContent>

          <TabsContent value="contact" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
              <div className="space-y-2"><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>Teléfono secundario</Label><Input value={form.phone_secondary} onChange={(e) => set('phone_secondary', e.target.value)} /></div>
            <div className="space-y-2"><Label>Dirección</Label><Input value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Ciudad</Label><Input value={form.city} onChange={(e) => set('city', e.target.value)} /></div>
              <div className="space-y-2"><Label>CP</Label><Input value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} /></div>
              <div className="space-y-2"><Label>Provincia</Label><Input value={form.province} onChange={(e) => set('province', e.target.value)} /></div>
            </div>
          </TabsContent>

          <TabsContent value="preferences" className="space-y-4 mt-4">
            <div className="space-y-2"><Label>Origen/Captación</Label>
              <Select value={form.source || ''} onValueChange={(v) => set('source', v)}>
                <SelectTrigger><SelectValue placeholder="¿Cómo nos conoció?" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="walk_in">Visita tienda</SelectItem>
                  <SelectItem value="referral">Recomendación</SelectItem>
                  <SelectItem value="web">Web</SelectItem>
                  <SelectItem value="social_media">Redes sociales</SelectItem>
                  <SelectItem value="event">Evento</SelectItem>
                  <SelectItem value="press">Prensa</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Descuento fijo (%)</Label>
              <Input type="number" min={0} max={100} placeholder="0" value={form.discount_percentage} onChange={(e) => set('discount_percentage', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-4">
              <h4 className="text-sm font-semibold">Tallas estándar</h4>
              <div className="grid grid-cols-4 gap-3">
                {['Americana', 'Pantalón', 'Camisa', 'Zapato'].map(garment => (
                  <div key={garment} className="space-y-1">
                    <Label className="text-xs">{garment}</Label>
                    <Input placeholder="Ej: 50" value={form.standard_sizes[garment.toLowerCase()] || ''}
                      onChange={(e) => set('standard_sizes', { ...form.standard_sizes, [garment.toLowerCase()]: e.target.value })} />
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2"><Label>Notas internas</Label>
              <Textarea value={form.internal_notes} onChange={(e) => set('internal_notes', e.target.value)} placeholder="Preferencias, observaciones..." rows={3} />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => {
            const dateOfBirth = form.date_of_birth && String(form.date_of_birth).length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(form.date_of_birth)
              ? form.date_of_birth
              : null
            execute({ ...form, date_of_birth: dateOfBirth })
          }} disabled={isLoading || !form.first_name || !form.last_name}
            className="bg-prats-navy hover:bg-prats-navy-light">
            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creando...</> : 'Crear cliente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
