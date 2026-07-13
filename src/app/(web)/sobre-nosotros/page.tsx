import { Metadata } from 'next'
import Image from 'next/image'
import { Sacramento } from 'next/font/google'

const sacramento = Sacramento({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
})

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Sobre nosotros — Sastrería Prats',
  description:
    'Descubre la historia de Sastrería Prats: desde los primeros pasos de Joaquín Fernández Prats hasta la marca PRATS. Auténtico e Imperfecto.',
  alternates: { canonical: '/sobre-nosotros' },
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
      'https://fvjdqazfgjspxmwlvkpg.supabase.co/storage/v1/object/public/product-images/web/sastreria-prats-joaquin-fernandez-prats-infancia.jpg',
    imageAlt: 'Joaquín Fernández Prats de niño entre telas y patrones de sastrería, 1978',
    layout: 'text-image',
  },
  {
    year: '1995',
    text: 'Como toda ayuda en casa era bienvenida y los estudios no eran su fuerte, al iniciar su adolescencia Joaquín empezó a echar a sus padres con los encargos que recibían de los sastres para los que trabajaban. Con 16 años empezó a trabajar fuera de casa como aprendiz en diversas sastrerías, compatibilizándolo poco después con sus estudios en la Escuela Superior de Sastrería "La Confianza"… Y así, año tras año, sus manos fueron poco a poco descubriendo las técnicas y secretos que sólo los verdaderos artesanos conocen.',
    image:
      'https://fvjdqazfgjspxmwlvkpg.supabase.co/storage/v1/object/public/product-images/web/sastreria-prats-joaquin-aprendiz-sastre-madrid.jpg',
    imageAlt: 'Joaquín Fernández Prats como aprendiz de sastre en Madrid, años 90',
    layout: 'image-text',
  },
  {
    year: '2019',
    text: 'Y por fin, con la maestría y confianza que dan más de 3 décadas en el oficio, Joaquín cumple su sueño y abre su propia sastrería en la zona más exclusiva del madrileño barrio de Chamartín. Un espacio de dos plantas que cuenta con un taller en el que se confeccionan las prendas artesanales. Gracias a la extraordinaria cartera de clientes construida a lo largo de los años, su local se convierte desde el inicio en uno de los templos de la sastrería en España. Pocos meses después abre un segundo espacio en la capital.',
    image:
      'https://fvjdqazfgjspxmwlvkpg.supabase.co/storage/v1/object/public/product-images/web/sastreria-prats-tienda-chamartin-madrid.jpg',
    imageAlt: 'Tienda de Sastrería Prats en el barrio de Chamartín, Madrid',
    layout: 'text-image',
  },
  {
    year: '2025',
    text: 'Tras años de sólido crecimiento, Joaquín da un nuevo salto. Lo que había nacido 6 años antes como «Sastrería Fernández Prats» se convierte en PRATS, una marca de moda masculina donde conviven las prendas artesanales de la sastrería clásica junto a una colección prêt-à-porter de estilo atemporal. Un puro reflejo de la forma que tiene Joaquín, no sólo de ver la moda masculina, sino de ser. Auténtico e imperfecto.',
    image:
      'https://fvjdqazfgjspxmwlvkpg.supabase.co/storage/v1/object/public/product-images/web/prats-moda-masculina-madrid-autentico-imperfecto.jpg',
    imageAlt: 'Bolsa de PRATS, marca de moda masculina en Madrid — Auténtico e Imperfecto',
    layout: 'image-text',
  },
]

export default function SobreNosotrosPage() {
  return (
    <div className="bg-white">
      {/* HERO — título manuscrito centrado, fila propia */}
      <section className="w-full px-6 py-16 sm:py-20 md:py-28">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-center text-center">
          <h1
            className={`${sacramento.className} text-5xl leading-none text-black sm:text-6xl md:text-7xl lg:text-[88px]`}
          >
            Auténtico e Imperfecto
          </h1>
        </div>
      </section>

      {/* TIMELINE — filas alternas, mobile-first */}
      <div className="w-full">
        {TIMELINE.map((hito) => (
          <TimelineRow key={hito.year} item={hito} />
        ))}
      </div>
    </div>
  )
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const isImageFirst = item.layout === 'image-text'

  return (
    <section className="grid w-full grid-cols-1 items-stretch md:grid-cols-2">
      {/* Mobile: siempre imagen arriba, texto abajo.
          Desktop: alternar según layout */}
      <div className={isImageFirst ? 'order-1 md:order-1' : 'order-1 md:order-2'}>
        <ImageBlock src={item.image} alt={item.imageAlt} />
      </div>
      <div className={isImageFirst ? 'order-2 md:order-2' : 'order-2 md:order-1'}>
        <TextBlock year={item.year} text={item.text} />
      </div>
    </section>
  )
}

function TextBlock({ year, text }: { year: string; text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-white px-6 py-12 text-center sm:px-10 sm:py-16 md:px-16 md:py-24">
      <p className="mb-8 max-w-xl text-[13px] leading-[1.7] text-black sm:text-sm md:text-base md:leading-[1.8]">
        {text}
      </p>
      <p className="mb-3 text-2xl font-normal tracking-wide text-black sm:text-3xl md:text-4xl">
        {year}
      </p>
      <span className="block h-px w-10 bg-black sm:w-12" />
    </div>
  )
}

function ImageBlock({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative w-full aspect-[4/3] md:aspect-auto md:h-full md:min-h-[560px]">
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
