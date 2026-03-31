import { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Servicios de sastrería — Sastrería Prats',
  description:
    'Sastrería artesanal, Made to Measure y Ready to Wear. Descubre nuestros tres servicios de moda masculina en Madrid.',
  openGraph: {
    title: 'Servicios — Sastrería Prats',
    description: 'Artesanal · Made to Measure · Ready to Wear',
  },
}

const SERVICES = [
  {
    tag: 'SASTRERÍA ARTESANAL',
    title: 'Sastrería Artesanal',
    text: 'Guiados por Joaquín Fernández Prats, en nuestro taller se elaboran artesanalmente cada una de las prendas. El proceso comienza con una conversación para comprender al cliente, seguida de una toma de medidas exhaustiva. A partir de ahí, se traza el patrón a mano, se corta el tejido seleccionado y se realiza una primera prueba hilvanada. Tras sucesivos ajustes — cada uno más fino que el anterior — la prenda adquiere su forma definitiva. Un traje verdaderamente a medida que solo las manos expertas pueden crear.',
    image:
      'https://www.sastreriaprats.com/cdn/shop/files/RAYA_BEIGE-4_52e6b747-132d-4b7f-80fc-fd7238eb6d1c.jpg?v=1748424021&width=640',
    imageAlt: 'Sastrería artesanal — detalle de tejido',
  },
  {
    tag: 'MADE TO MEASURE',
    title: 'Made to Measure',
    text: 'Tras la toma de medidas, el patrón se ajusta digitalmente y se envía a un plotter antes de confeccionar en taller. La prenda llega a la sastrería, el cliente se la prueba y se realizan los ajustes finales necesarios. Es la opción ideal para quienes buscan introducirse en el mundo de la medida con plazos más cortos o un presupuesto más ajustado, sin renunciar a un resultado personalizado y de calidad.',
    image:
      'https://www.sastreriaprats.com/cdn/shop/files/IMG_0620.jpg?v=1748365135&width=640',
    imageAlt: 'Made to Measure — proceso de confección',
  },
  {
    tag: 'READY TO WEAR',
    title: 'Ready to Wear',
    text: 'Bajo la marca PRATS, ofrecemos una colección de prendas y complementos de esencia atemporal. Confeccionadas con los mismos tejidos que utilizamos en la sastrería artesanal y con producción nacional, cada pieza mantiene nuestra exigencia de calidad. La colección se complementa con una selección de marcas italianas e inglesas de prestigio, creando un armario masculino completo donde tradición y estilo contemporáneo conviven.',
    image:
      'https://www.sastreriaprats.com/cdn/shop/files/SS25_CAMISA-LINO-CUELLO-VISTA-NEGRA_1.jpg?v=1748364985&width=640',
    imageAlt: 'Ready to Wear — colección PRATS',
  },
]

export default function SastreriaPage() {
  return (
    <main className="bg-white">
      {/* HERO */}
      <section className="relative h-screen overflow-hidden group">
        <Image
          src="https://www.sastreriaprats.com/cdn/shop/files/recursos_taller_-3.jpg?v=1718892989&width=2000"
          alt="Taller de sastrería Prats"
          fill
          className="object-cover object-center transition-transform duration-1000 group-hover:scale-105"
          sizes="100vw"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-center px-8 md:px-20 max-w-2xl">
          <p className="text-xs tracking-[0.4em] text-white/60 mb-4">
            SASTRERÍA A MEDIDA
          </p>
          <h1 className="font-serif text-5xl md:text-6xl font-light text-white leading-tight">
            Arte Hecho Prenda
          </h1>
          <p className="mt-6 text-sm md:text-base text-white/80 leading-relaxed max-w-lg">
            Vestir a medida es elegir quién quieres ser. Cada traje nace de una
            conversación, de medidas tomadas con tiempo y de un oficio que
            convierte tela en segunda piel.
          </p>
          <div className="mt-10">
            <Link
              href="/reservar"
              className="inline-block bg-white text-prats-navy px-10 py-4 text-xs tracking-[0.3em] font-medium hover:bg-white/90 transition-colors"
            >
              RESERVAR CITA
            </Link>
          </div>
        </div>
      </section>

      {/* 3 SERVICIOS — cada uno min-h-screen */}
      {SERVICES.map((service, i) => {
        const isEven = i % 2 === 0
        return (
          <section
            key={service.tag}
            className="grid grid-cols-1 md:grid-cols-2 min-h-screen"
          >
            {/* Imagen */}
            <div
              className={`relative overflow-hidden ${
                isEven ? 'md:order-1' : 'md:order-2'
              }`}
            >
              <Image
                src={service.image}
                alt={service.imageAlt}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>

            {/* Texto */}
            <div
              className={`flex flex-col justify-center px-8 md:px-16 lg:px-20 py-16 md:py-24 ${
                isEven
                  ? 'md:order-2 bg-prats-cream'
                  : 'md:order-1 bg-white'
              }`}
            >
              <p className="text-xs tracking-[0.3em] text-prats-gold mb-4">
                {service.tag}
              </p>
              <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-light text-prats-navy leading-tight mb-8">
                {service.title}
              </h2>
              <p className="text-sm md:text-base text-prats-navy/70 leading-relaxed max-w-lg">
                {service.text}
              </p>
            </div>
          </section>
        )
      })}

      {/* CTA FINAL */}
      <section className="bg-prats-navy py-24 px-8 text-center">
        <p className="font-serif text-3xl md:text-4xl font-light text-white mb-10 max-w-2xl mx-auto leading-tight">
          Tu traje perfecto empieza con una conversación
        </p>
        <Link
          href="/reservar"
          className="inline-block bg-white text-prats-navy px-14 py-5 text-sm tracking-[0.25em] font-medium hover:bg-white/95 transition-colors"
        >
          RESERVAR CITA GRATUITA
        </Link>
      </section>
    </main>
  )
}
