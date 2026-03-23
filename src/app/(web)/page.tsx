import Link from 'next/link'
import Image from 'next/image'
import { getHomeContent } from '@/actions/cms'
import type { Metadata } from 'next'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Sastrería Prats — Madrid · Sastrería a medida y boutique',
  description: 'Sastrería de lujo en Madrid desde 1985. Trajes a medida, americanas y colección boutique.',
  openGraph: {
    title: 'Sastrería Prats — Madrid',
    description: 'Sastrería de lujo en Madrid desde 1985.',
  },
}

export default async function HomePage() {
  const content = await getHomeContent()

  const hero = content.hero!
  const categories = content.categories!
  const editorialDouble = content.editorial_double!
  const processSteps = content.process_steps!

  return (
    <main className="bg-white font-sans antialiased">
      {/* HERO — imagen B/N full-width, sin overlay ni texto */}
      <section className="relative w-full overflow-hidden">
        <Image
          src={hero.image_url}
          alt=""
          width={2000}
          height={1000}
          className="w-full h-auto object-cover grayscale"
          sizes="100vw"
          priority
        />
        <h1 className="sr-only">{hero.title_es} — {hero.subtitle_es}</h1>
      </section>

      {/* ESPACIOS — 2 columnas con imagen de fondo y botón DESCUBRE */}
      <section className="grid grid-cols-1 md:grid-cols-2">
        {categories.blocks.slice(0, 2).map((card, i) => (
          <Link
            key={i}
            href={card.link_url}
            className="group relative block aspect-[4/3] overflow-hidden"
          >
            <Image
              src={card.image_url}
              alt=""
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
            <div className="absolute inset-0 bg-black/20 transition-colors duration-300 group-hover:bg-black/30" />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <p className="text-xs tracking-[0.3em] uppercase mb-2">ESPACIO</p>
              <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-wide mb-6">
                {card.title_es.toUpperCase()}
              </h2>
              <span className="border border-white/80 px-8 py-2.5 text-xs font-medium tracking-[0.2em] uppercase transition-colors group-hover:bg-white/10">
                DESCUBRE
              </span>
            </div>
          </Link>
        ))}
      </section>

      {/* SASTRERÍA ARTESANAL + PROCESO */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-0">
        {/* Columna izquierda: título y botón */}
        <div className="flex flex-col justify-center px-8 py-16 md:px-16 lg:py-24">
          <h2 className="text-4xl md:text-5xl font-bold text-black leading-tight">
            {editorialDouble.title_es}
          </h2>
          <div className="mt-8">
            <Link
              href={editorialDouble.button_url}
              className="inline-block bg-black text-white px-8 py-3 text-xs font-medium tracking-[0.15em] uppercase rounded-full hover:bg-gray-800 transition-colors"
            >
              {editorialDouble.button_label}
            </Link>
          </div>
        </div>

        {/* Columna derecha: pasos del proceso */}
        <div className="px-8 py-16 md:px-16 lg:py-24 border-l border-gray-100">
          <h3 className="text-2xl md:text-3xl font-bold text-black mb-8">
            {processSteps.title_es}
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed mb-8">
            En <strong>Sastrería Prats</strong> creemos que un traje a medida es mucho más que una prenda: es el resultado de un proceso artesanal donde tradición, precisión y estilo se unen para crear una pieza única. Cada traje nace de una idea y evoluciona a través de un trabajo meticuloso que combina técnicas de sastrería clásica con una atención absoluta al detalle.
          </p>
          <div className="space-y-8">
            {processSteps.blocks.map((step, i) => (
              <div key={i}>
                <h4 className="text-xl font-bold text-black mb-3">
                  {step.title_es}
                </h4>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {step.content_es}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
