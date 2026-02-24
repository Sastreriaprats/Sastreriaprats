import Link from 'next/link'

export default function SastreriaPage() {
  return (
    <main className="bg-white">
      {/* HERO - Pantalla completa, taller */}
      <section className="relative h-screen overflow-hidden group">
        <img
          src="https://www.sastreriaprats.com/cdn/shop/files/recursos_taller_-3.jpg?v=1718892989&width=2000"
          alt="Taller de sastrería Prats"
          className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-1000 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-center px-8 md:px-20 max-w-2xl">
          <p className="text-xs tracking-[0.4em] text-white/60 mb-4">SASTRERÍA A MEDIDA</p>
          <h1 className="font-serif text-5xl md:text-6xl font-light text-white leading-tight">
            Arte Hecho Prenda
          </h1>
          <p className="mt-6 text-sm md:text-base text-white/80 leading-relaxed max-w-lg">
            Vestir a medida es elegir quién quieres ser. Cada traje nace de una conversación, de medidas tomadas con tiempo y de un oficio que convierte tela en segunda piel.
          </p>
          <div className="mt-10">
            <Link
              href="/reservar"
              className="inline-block bg-white text-[#1a2744] px-10 py-4 text-xs tracking-[0.3em] font-medium hover:bg-white/90 transition-colors mt-8"
            >
              RESERVAR CITA
            </Link>
          </div>
        </div>
      </section>

      {/* MANIFIESTO */}
      <section className="py-24 md:py-32 px-8 md:px-16 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <blockquote className="font-serif text-3xl md:text-4xl lg:text-5xl font-light text-[#1a2744] leading-tight">
            Un traje bien hecho no se lleva.<br />Se habita.
          </blockquote>
          <div className="mt-12 text-sm md:text-base text-[#1a2744]/70 leading-relaxed space-y-4">
            <p>
              La ropa a medida no es un lujo superfluo: es la decisión de sentirte único. Cada prenda que sale de nuestro taller ha pasado por las manos de artesanos que dedican horas a un solo traje, a un solo abrigo. No hay prisa. Solo el compromiso con un resultado que te defina.
            </p>
            <p>
              Elegir sastrería es invertir en ti: en comodidad real, en siluetas que respetan tu cuerpo, en tejidos que duran décadas. Es la antítesis del usar y tirar. Es habitar la ropa, no solo llevarla puesta.
            </p>
          </div>
        </div>
      </section>

      {/* FOTO + TEXTO - Por qué a medida */}
      <section className="grid grid-cols-1 md:grid-cols-2 min-h-[70vh]">
        <div className="relative overflow-hidden group order-2 md:order-1">
          <img
            src="https://www.sastreriaprats.com/cdn/shop/files/recursos_taller_-6.jpg?v=1718892990&width=1200"
            alt="Detalle del taller"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105"
          />
        </div>
        <div className="flex flex-col justify-center px-8 md:px-16 py-16 md:py-24 bg-[#fafaf9] order-1 md:order-2">
          <p className="text-xs tracking-[0.4em] text-[#1a2744]/50 mb-6">POR QUÉ A MEDIDA</p>
          <h2 className="font-serif text-3xl md:text-4xl font-light text-[#1a2744] leading-tight mb-8">
            Comodidad, personalidad e inversión que perdura
          </h2>
          <div className="space-y-4 text-sm md:text-base text-[#1a2744]/80 leading-relaxed">
            <p>
              <strong className="text-[#1a2744]">Comodidad real.</strong> Un traje confeccionado sobre tu cuerpo no tira, no aprieta. Te olvidas de que lo llevas puesto.
            </p>
            <p>
              <strong className="text-[#1a2744]">Personalidad.</strong> Elegir tela, solapas, botonadura y acabados hace que la prenda sea solo tuya. Refleja quién eres.
            </p>
            <p>
              <strong className="text-[#1a2744]">Inversión y durabilidad.</strong> Un buen traje a medida, bien cuidado, te acompaña décadas. El coste por uso se diluye en el tiempo y en la calidad.
            </p>
          </div>
        </div>
      </section>

      {/* SECCIÓN OSCURA - Historia */}
      <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden group">
        <img
          src="https://www.sastreriaprats.com/cdn/shop/files/DIEGO_PRATS-76.jpg?v=1718899328&width=1600"
          alt="Prats, sastrería de Madrid"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-[#1a2744]/80" />
        <div className="relative z-10 px-8 md:px-16 py-24 text-center max-w-3xl mx-auto">
          <p className="text-xs tracking-[0.4em] text-white/50 mb-6">DESDE 1940</p>
          <h2 className="font-serif text-4xl md:text-5xl font-light text-white leading-tight mb-8">
            Más de ochenta años de maestría en Madrid
          </h2>
          <p className="text-white/90 text-sm md:text-base leading-relaxed">
            Tres generaciones han convertido Prats en un referente de la sastrería española. Cada traje que sale de nuestro taller lleva el mismo rigor, la misma paciencia y el mismo respeto por el oficio que hace décadas. No fabricamos en serie: construimos prendas que cuentan tu historia.
          </p>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="bg-[#1a2744] py-24 px-8 text-center">
        <p className="font-serif text-3xl md:text-4xl font-light text-white mb-10 max-w-2xl mx-auto leading-tight">
          Tu traje perfecto empieza con una conversación
        </p>
        <Link
          href="/reservar"
          className="inline-block bg-white text-[#1a2744] px-14 py-5 text-sm tracking-[0.25em] font-medium min-w-[280px] text-center border border-white/20 hover:bg-white/95 hover:border-white/40 transition-all duration-300"
        >
          RESERVAR CITA GRATUITA
        </Link>
      </section>
    </main>
  )
}
