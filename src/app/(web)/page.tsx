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
  const strip = content.editorial_strip!
  const categories = content.categories!
  const editorialDouble = content.editorial_double!
  const stores = content.stores!
  const cta = content.cta!

  return (
    <main className="bg-white font-sans antialiased">
      {/* HERO — 100vh, imagen full, texto centrado, overlay */}
      <section className="relative min-h-[100vh] overflow-hidden">
        <Image
          src={hero.image_url}
          alt=""
          fill
          className="object-cover object-center"
          sizes="100vw"
          priority
        />
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative z-10 flex min-h-[100vh] flex-col items-center justify-center px-6 text-center text-white">
          <h1 className="font-serif text-5xl font-normal tracking-wide md:text-7xl lg:text-8xl">
            {hero.title_es}
          </h1>
          <p className="mt-4 text-sm font-light tracking-[0.35em] text-white/90 md:text-base">
            {hero.subtitle_es}
          </p>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
            <Link
              href={hero.button1_url}
              className="bg-white px-8 py-3 text-xs font-medium tracking-[0.2em] text-black transition-colors hover:bg-white/90"
            >
              {hero.button1_label}
            </Link>
            <Link
              href={hero.button2_url}
              className="border border-white/80 px-8 py-3 text-xs font-medium tracking-[0.2em] text-white transition-colors hover:bg-white/10"
            >
              {hero.button2_label}
            </Link>
          </div>
        </div>
      </section>

      {/* EDITORIAL STRIP */}
      <section className="bg-black py-4 text-center">
        <p className="text-xs font-light tracking-[0.35em] text-white/90 md:text-sm">
          {strip.content_es}
        </p>
      </section>

      {/* GRID CATEGORÍAS — 3 columnas, imagen vertical, overlay hover, título abajo */}
      <section className="grid grid-cols-1 md:grid-cols-3">
        {categories.blocks.map((card, i) => (
          <Link
            key={i}
            href={card.link_url}
            className="group relative block aspect-[3/4] overflow-hidden"
          >
            <Image
              src={card.image_url}
              alt=""
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, 33vw"
            />
            <div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/40" />
            <div className="absolute bottom-0 left-0 right-0 p-6 text-center">
              <span className="font-serif text-2xl font-light text-white md:text-3xl">
                {card.title_es}
              </span>
            </div>
          </Link>
        ))}
      </section>

      {/* EDITORIAL DOBLE — 50/50 imagen | crema + texto */}
      <section className="grid grid-cols-1 md:grid-cols-2">
        <div className="relative aspect-[4/5] md:aspect-auto md:min-h-[480px]">
          <Image
            src={editorialDouble.image_url}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </div>
        <div
          className="flex flex-col items-center justify-center px-8 py-16 md:px-12 md:py-24"
          style={{ backgroundColor: '#f5f0e8' }}
        >
          <h2 className="font-serif text-3xl font-light text-black md:text-4xl">
            {editorialDouble.title_es}
          </h2>
          <p className="mt-6 max-w-md text-center text-sm font-light leading-relaxed text-black/80">
            {editorialDouble.content_es}
          </p>
          <Link
            href={editorialDouble.button_url}
            className="mt-10 border border-black px-8 py-3 text-xs font-medium tracking-[0.2em] text-black transition-colors hover:bg-black hover:text-white"
          >
            {editorialDouble.button_label}
          </Link>
        </div>
      </section>

      {/* TIENDAS */}
      <section className="px-6 py-16 md:px-12 lg:px-16">
        <h2 className="font-serif text-3xl font-light text-black md:text-4xl">
          {stores.title_es}
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
          {stores.blocks.map((store, i) => (
            <a
              key={i}
              href={store.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative block overflow-hidden"
            >
              <div className="aspect-video relative">
                <Image
                  src={store.image_url}
                  alt=""
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </div>
              <div className="absolute inset-0 bg-black/30" />
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white">
                <h3 className="font-serif text-2xl font-light md:text-3xl">
                  {store.title_es}
                </h3>
                <p className="mt-2 text-sm font-light text-white/90">
                  {store.content_es}
                </p>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="bg-black px-6 py-20 text-center md:py-24">
        <p className="font-serif text-2xl font-light text-white md:text-3xl">
          {cta.title_es}
        </p>
        <Link
          href={cta.button_url}
          className="mt-8 inline-block bg-white px-10 py-3 text-xs font-medium tracking-[0.2em] text-black transition-colors hover:bg-white/90"
        >
          {cta.button_label}
        </Link>
      </section>
    </main>
  )
}
