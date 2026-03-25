import { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Sobre nosotros — Sastrería Prats',
  description:
    'Descubre la historia de Sastrería Prats: desde los primeros pasos de Joaquín Fernández Prats hasta la marca PRATS. Auténtico e Imperfecto.',
  openGraph: {
    title: 'Sobre nosotros — Sastrería Prats',
    description: 'Tres generaciones de sastrería artesanal en Madrid.',
  },
}

const TIMELINE = [
  {
    year: '1978',
    title: 'Los primeros hilos',
    text: 'Joaquín Fernández Prats nace en el seno de una familia de oficiales de sastrería. Desde los dos años, entre retales, patrones y el sonido de las máquinas de coser, empieza a jugar con telas. Sin saberlo, da sus primeros pasos en un oficio que definirá su vida entera.',
    image:
      'https://www.sastreriaprats.com/cdn/shop/files/BN.jpg?v=1739364243&width=640',
    imageAlt: 'Joaquín de niño en el taller familiar',
  },
  {
    year: '1995',
    title: 'El aprendiz',
    text: 'La adolescencia transcurre entre mesas de corte y maniquíes. Joaquín trabaja como aprendiz en talleres de Madrid mientras estudia en la Escuela Superior de Sastrería "La Confianza". Pasan años de disciplina, de coser a mano ojales interminables, de absorber técnicas artesanales que solo el tiempo y la repetición pueden enseñar.',
    image:
      'https://www.sastreriaprats.com/cdn/shop/files/Scan_0007.jpg?v=1731077624&width=640',
    imageAlt: 'Joaquín como aprendiz de sastre',
  },
  {
    year: '2019',
    title: 'La sastrería propia',
    text: 'Joaquín abre las puertas de su propia sastrería en el barrio de Chamartín, Madrid. Un espacio de dos plantas con taller propio donde cada prenda nace y se termina bajo el mismo techo. Poco después, un segundo espacio se inaugura en pleno corazón de la capital, consolidando un proyecto que crece con la misma paciencia con la que se cose a mano.',
    image:
      'https://www.sastreriaprats.com/cdn/shop/files/Scan_0004.jpg?v=1731077636&width=640',
    imageAlt: 'Interior de la sastrería en Chamartín',
  },
  {
    year: '2025',
    title: 'PRATS nace',
    text: 'La sastrería se transforma en PRATS, una marca de moda masculina que combina la artesanía de siempre con una colección prêt-à-porter de esencia atemporal. Los mismos tejidos, la misma exigencia, ahora también en prendas listas para vestir. El lema lo dice todo: Auténtico e Imperfecto.',
    image:
      'https://www.sastreriaprats.com/cdn/shop/files/bolsa.jpg?v=1738690195&width=640',
    imageAlt: 'Bolsa PRATS — Auténtico e Imperfecto',
  },
]

export default function SobreNosotrosPage() {
  return (
    <main className="bg-white">
      {/* HERO */}
      <section className="relative h-[70vh] md:h-[80vh] overflow-hidden">
        <Image
          src="https://www.sastreriaprats.com/cdn/shop/files/Sin_titulo-3_de2eb28f-8b92-404d-8735-f88ad458c76b.jpg?v=1731078358&width=640"
          alt="Sastrería Prats — Historia"
          fill
          className="object-cover grayscale"
          sizes="100vw"
          priority
        />
        <div className="absolute inset-0 bg-black/50" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <p className="text-xs tracking-[0.4em] text-white/60 mb-4">
            NUESTRA HISTORIA
          </p>
          <h1 className="font-serif text-4xl md:text-6xl font-light text-white leading-tight max-w-3xl">
            Tres generaciones de maestría artesanal
          </h1>
          <p className="mt-6 text-sm md:text-base text-white/80 max-w-xl leading-relaxed">
            Desde un taller familiar hasta una marca que viste a quienes
            valoran lo auténtico. Esta es la historia de Prats.
          </p>
        </div>
      </section>

      {/* TIMELINE */}
      <section className="py-20 md:py-32">
        {TIMELINE.map((hito, i) => {
          const isEven = i % 2 === 0
          return (
            <div key={hito.year}>
              {/* Año separador */}
              <div className="text-center py-12 md:py-16">
                <span className="font-serif text-6xl md:text-8xl font-light text-prats-navy/10">
                  {hito.year}
                </span>
              </div>

              {/* Contenido: imagen + texto */}
              <div
                className={`grid grid-cols-1 md:grid-cols-2 gap-0 min-h-[50vh] ${
                  isEven ? '' : 'md:[direction:rtl]'
                }`}
              >
                {/* Imagen */}
                <div className="relative aspect-[4/3] md:aspect-auto overflow-hidden md:[direction:ltr]">
                  <Image
                    src={hito.image}
                    alt={hito.imageAlt}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 50vw"
                  />
                </div>

                {/* Texto */}
                <div className="flex flex-col justify-center px-8 md:px-16 py-12 md:py-20 bg-prats-cream md:[direction:ltr]">
                  <p className="text-xs tracking-[0.3em] text-prats-gold mb-4 uppercase">
                    {hito.year}
                  </p>
                  <h2 className="font-serif text-3xl md:text-4xl font-light text-prats-navy leading-tight mb-6">
                    {hito.title}
                  </h2>
                  <p className="text-sm md:text-base text-prats-navy/70 leading-relaxed">
                    {hito.text}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </section>

      {/* CTA FINAL */}
      <section className="bg-prats-navy py-20 md:py-28 px-8 text-center">
        <p className="font-serif text-3xl md:text-4xl font-light text-white mb-4 max-w-2xl mx-auto leading-tight">
          ¿Quieres conocernos en persona?
        </p>
        <p className="text-sm text-white/60 mb-10">
          Reserva una cita sin compromiso en cualquiera de nuestras boutiques.
        </p>
        <Link
          href="/reservar"
          className="inline-block bg-white text-prats-navy px-12 py-4 text-xs tracking-[0.25em] font-medium hover:bg-white/90 transition-colors"
        >
          RESERVAR CITA
        </Link>
      </section>
    </main>
  )
}
