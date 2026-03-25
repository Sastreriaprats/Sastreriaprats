import { Metadata } from 'next'
import { MapPin, Phone, Clock, ExternalLink } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Nuestras tiendas — Sastrería Prats',
  description: 'Visítanos en nuestras boutiques de Madrid: Hermanos Pinzón y Wellington.',
}

type StoreInfo = {
  name: string
  subtitle?: string
  address: string
  phones: { label: string; number: string }[]
  hours: { label: string; detail: string }[]
  closed: string
  mapsUrl: string
  imageUrl?: string | null
}

const FALLBACK_STORES: StoreInfo[] = [
  {
    name: 'Hermanos Pinzón',
    subtitle: 'Calle Hermanos Pinzón, 4',
    address: 'Calle Hermanos Pinzón, 4 - 28036 Madrid',
    phones: [
      { label: 'Tienda', number: '+34 912 401 845' },
      { label: 'General', number: '+34 669 98 55 47' },
    ],
    hours: [
      { label: 'Lunes a Viernes', detail: '10:00 – 20:00' },
      { label: 'Sábados', detail: '10:00 – 14:00' },
    ],
    closed: 'Domingos: Cerrado',
    mapsUrl: 'https://maps.app.goo.gl/Vf8puqTToyqvTirq5',
  },
  {
    name: 'Wellington',
    subtitle: 'Wellington Hotel & Spa',
    address: 'Calle Velázquez, 8 - 28001 Madrid',
    phones: [
      { label: 'Tienda', number: '+34 671 35 34 65' },
    ],
    hours: [
      { label: 'Lunes a Viernes', detail: '10:00 – 14:00 | 16:30 – 20:30' },
      { label: 'Sábados', detail: '10:00 – 14:00' },
    ],
    closed: 'Domingos: Cerrado',
    mapsUrl: 'https://maps.app.goo.gl/Cd36bN32ctpTmtub8',
  },
]

function buildStoreFromDb(row: any, fallback: StoreInfo): StoreInfo {
  return {
    name: fallback.name,
    subtitle: fallback.subtitle,
    address: row.address
      ? `${row.address}${row.postal_code ? ` - ${row.postal_code}` : ''} ${row.city || 'Madrid'}`
      : fallback.address,
    phones: fallback.phones,
    hours: fallback.hours,
    closed: fallback.closed,
    mapsUrl: row.google_maps_url || fallback.mapsUrl,
    imageUrl: row.image_url || null,
  }
}

async function getStores(): Promise<StoreInfo[]> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('stores')
      .select('name, address, city, postal_code, phone, google_maps_url, image_url, opening_hours')
      .eq('is_active', true)
      .eq('store_type', 'physical')
      .order('created_at', { ascending: true })
      .limit(2)

    if (!data || data.length === 0) return FALLBACK_STORES

    return data.map((row, i) => buildStoreFromDb(row, FALLBACK_STORES[i] || FALLBACK_STORES[0]))
  } catch {
    return FALLBACK_STORES
  }
}

export default async function TiendasPage() {
  const stores = await getStores()

  return (
    <div className="container mx-auto px-4 py-16 sm:py-20">
      <h1 className="mb-4 font-display text-4xl font-light text-prats-navy">
        Nuestras tiendas
      </h1>
      <p className="mb-12 text-muted-foreground max-w-2xl">
        Visítanos en nuestras boutiques de Madrid. Cada espacio ha sido diseñado para
        ofrecerte una experiencia única de sastrería y moda masculina.
      </p>

      <div className="grid gap-10 lg:grid-cols-2">
        {stores.map((store, i) => (
          <article
            key={i}
            className="group rounded-lg border border-border bg-white overflow-hidden transition-shadow hover:shadow-lg"
          >
            {/* Placeholder imagen */}
            <div className="relative aspect-[16/9] bg-prats-beige flex items-center justify-center">
              {store.imageUrl ? (
                <img
                  src={store.imageUrl}
                  alt={store.name}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="text-center">
                  <MapPin className="mx-auto h-10 w-10 text-prats-gold/50" />
                  <p className="mt-2 text-sm text-prats-navy/40 tracking-wider uppercase">{store.name}</p>
                </div>
              )}
            </div>

            <div className="p-6 sm:p-8 space-y-5">
              <div>
                <h2 className="text-2xl font-bold text-prats-navy">{store.name}</h2>
                {store.subtitle && (
                  <p className="text-sm text-prats-gold font-medium mt-1">{store.subtitle}</p>
                )}
              </div>

              <div className="flex gap-3">
                <MapPin className="h-5 w-5 shrink-0 text-prats-gold mt-0.5" />
                <p className="text-sm text-muted-foreground">{store.address}</p>
              </div>

              <div className="flex gap-3">
                <Phone className="h-5 w-5 shrink-0 text-prats-gold mt-0.5" />
                <div className="space-y-1">
                  {store.phones.map((p, j) => (
                    <a
                      key={j}
                      href={`tel:${p.number.replace(/\s/g, '')}`}
                      className="block text-sm text-muted-foreground hover:text-prats-navy transition-colors"
                    >
                      {p.number}
                    </a>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <Clock className="h-5 w-5 shrink-0 text-prats-gold mt-0.5" />
                <div className="space-y-1">
                  {store.hours.map((h, j) => (
                    <p key={j} className="text-sm text-muted-foreground">
                      <span className="font-medium">{h.label}:</span> {h.detail}
                    </p>
                  ))}
                  <p className="text-sm font-medium text-muted-foreground">{store.closed}</p>
                </div>
              </div>

              <a
                href={store.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-prats-navy text-white px-6 py-2.5 text-sm font-medium tracking-wide hover:bg-prats-navy/90 transition-colors rounded-sm"
              >
                Cómo llegar
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
