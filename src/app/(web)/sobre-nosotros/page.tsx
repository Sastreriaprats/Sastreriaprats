import { Metadata } from 'next'
import Image from 'next/image'

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

type TimelineItem = {
  year: string
  text: string
  image: string
  imageAlt: string
  layout: 'text-image' | 'image-text'
}

const TIMELINE: TimelineItem[] = [
  {
    year: '1978',
    text: 'Con apenas dos años, el pequeño Joaquín ya comenzaba a jugar con las telas y patrones que sus padres, oficiales de sastrería, tenían en casa. Seguro no imaginaba que lo que por entonces parecía simplemente un juego, en realidad eran sus primeros pasos en un camino que mucho más adelante le convertiría en el sastre de una buena parte de los hombres más influyentes de España.',
    image:
      'https://www.sastreriaprats.com/cdn/shop/files/BN.jpg?v=1739364243&width=1200',
    imageAlt: 'Joaquín de niño',
    layout: 'text-image',
  },
  {
    year: '1995',
    text: 'Como toda ayuda en casa era bienvenida y los estudios no eran su fuerte, al iniciar su adolescencia Joaquín empezó a echar a sus padres con los encargos que recibían de los sastres para los que trabajaban. Con 16 años empezó a trabajar fuera de casa como aprendiz en diversas sastrerías, compatibilizándolo poco después con sus estudios en la Escuela Superior de Sastrería  "La Confianza" … Y así, año tras año, sus manos fueron poco a poco descubriendo las técnicas y secretos que sólo los verdaderos artesanos conocen.',
    image:
      'https://www.sastreriaprats.com/cdn/shop/files/Scan_0007.jpg?v=1731077624&width=1200',
    imageAlt: 'Joaquín como aprendiz de sastre',
    layout: 'image-text',
  },
  {
    year: '2019',
    text: 'Y por fin, con la maestría y confianza que dan más de 3 décadas en el oficio, Joaquín cumple su sueño y abre su propia sastrería en la zona más exclusiva de madrileño barrio de Chamartín. Un espacio de dos plantas que cuenta con un taller en el que se confeccionan las prendas artesanales. Gracias a la extraordinaria cartera de clientes construida a lo largo de los años, su local se convierte desde el inicio en uno de los templos de la sastrería en España. Pocos meses después abre un segundo espacio en la capital.',
    image:
      'https://www.sastreriaprats.com/cdn/shop/files/Scan_0004.jpg?v=1731077636&width=1200',
    imageAlt: 'Reportaje sobre la sastrería Prats',
    layout: 'text-image',
  },
  {
    year: '2025',
    text: 'Tras años de sólido crecimiento, Joaquín da un nuevo salto. Lo que había nacido 6 años antes como "Sastrería Fernández Prats" se convierte en PRATS, una marca de moda masculina donde conviven las prendas artesanales de la sastrería clásica junto a una colección prêt-à-porter de estilo atemporal. Un puro reflejo de la forma que tiene Joaquín, no sólo de ver la moda masculina, si no de ser. Auténtico e imperfecto',
    image:
      'https://www.sastreriaprats.com/cdn/shop/files/bolsa.jpg?v=1738690195&width=1200',
    imageAlt: 'Bolsa PRATS — Auténtico e Imperfecto',
    layout: 'image-text',
  },
]

export default function SobreNosotrosPage() {
  return (
    <main className="bg-white">
      {/* TÍTULO MANUSCRITO */}
      <section className="py-20 md:py-28 px-6 flex justify-center">
        <h1 className="sr-only">Auténtico e Imperfecto</h1>
        <Image
          src="https://www.sastreriaprats.com/cdn/shop/files/Captura_de_pantalla_2024-11-08_a_las_15.45.28.png?v=1731077134"
          alt="Auténtico e Imperfecto"
          width={900}
          height={220}
          priority
          className="w-full max-w-3xl h-auto"
        />
      </section>

      {/* TIMELINE */}
      <section>
        {TIMELINE.map((hito) => (
          <div
            key={hito.year}
            className="grid grid-cols-1 md:grid-cols-2 items-stretch"
          >
            {hito.layout === 'text-image' ? (
              <>
                <TextBlock year={hito.year} text={hito.text} />
                <ImageBlock src={hito.image} alt={hito.imageAlt} />
              </>
            ) : (
              <>
                <ImageBlock src={hito.image} alt={hito.imageAlt} />
                <TextBlock year={hito.year} text={hito.text} />
              </>
            )}
          </div>
        ))}
      </section>
    </main>
  )
}

function TextBlock({ year, text }: { year: string; text: string }) {
  return (
    <div className="flex flex-col justify-center items-center text-center px-8 md:px-16 py-16 md:py-24 bg-white">
      <p className="max-w-xl text-sm md:text-base text-black leading-relaxed mb-10">
        {text}
      </p>
      <p className="text-3xl md:text-4xl font-normal text-black tracking-wide mb-4">
        {year}
      </p>
      <span className="block w-12 h-px bg-black" />
    </div>
  )
}

function ImageBlock({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative w-full aspect-[4/3] md:aspect-auto md:min-h-[520px]">
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover"
        sizes="(max-width: 768px) 100vw, 50vw"
      />
    </div>
  )
}
