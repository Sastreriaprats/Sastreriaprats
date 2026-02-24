import Link from 'next/link'
import Image from 'next/image'

export default function HomePage() {
  return (
    <main className="bg-white">
      {/* HERO - Pantalla completa con foto editorial */}
      <section className="relative h-screen overflow-hidden">
        <img
          src="https://www.sastreriaprats.com/cdn/shop/files/AW25_-_DIEGO_MARTIN-191.jpg?v=1762421411&width=2000"
          alt="Sastrería Prats"
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />

        {/* Nav */}
        <nav className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-8 py-6 md:px-16">
          <div className="flex items-center gap-12">
            <Link href="/sastreria" className="text-xs tracking-[0.25em] text-white/80 hover:text-white transition-colors">SASTRERÍA</Link>
            <Link href="/boutique" className="text-xs tracking-[0.25em] text-white/80 hover:text-white transition-colors">BOUTIQUE</Link>
          </div>
          <Link href="/" className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
            <Image
              src="/logo-prats.png"
              alt="Prats"
              width={110}
              height={55}
              priority
              style={{ objectFit: 'contain', height: 55, width: 'auto', filter: 'invert(1) brightness(2)' }}
            />
          </Link>
          <div className="flex items-center gap-8">
            <Link href="/contacto" className="text-xs tracking-[0.25em] text-white/80 hover:text-white transition-colors">CONTACTO</Link>
            <Link href="/reservar" className="border border-white/60 px-5 py-2 text-xs tracking-[0.2em] text-white hover:bg-white hover:text-[#1a2744] transition-all">RESERVAR CITA</Link>
          </div>
        </nav>

        {/* Hero text */}
        <div className="absolute bottom-0 left-0 right-0 px-8 pb-20 md:px-16">
          <p className="text-xs tracking-[0.4em] text-white/60 mb-4">NUEVA COLECCIÓN · OTOÑO INVIERNO 2025</p>
          <h1 className="font-serif text-5xl font-light text-white md:text-7xl leading-tight max-w-2xl">Arte<br/>Hecho Prenda</h1>
          <div className="mt-8 flex gap-6">
            <Link href="/sastreria" className="bg-white text-[#1a2744] px-8 py-3 text-xs tracking-[0.2em] hover:bg-white/90 transition-colors">DESCUBRIR</Link>
            <Link href="/boutique" className="border border-white/60 text-white px-8 py-3 text-xs tracking-[0.2em] hover:bg-white/10 transition-colors">VER COLECCIÓN</Link>
          </div>
        </div>
      </section>

      {/* CATEGORÍAS */}
      <section className="grid grid-cols-1 md:grid-cols-2">
        <div className="relative aspect-[3/4] overflow-hidden group cursor-pointer">
          <img
            src="https://www.sastreriaprats.com/cdn/shop/files/recursos_taller_-3.jpg?v=1718892989&width=1200"
            alt="Sastrería Artesanal"
            className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/45 transition-colors duration-500" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
            <p className="text-xs tracking-[0.4em] text-white/60 mb-4">A MEDIDA</p>
            <h2 className="font-serif text-4xl md:text-5xl font-light text-white mb-6 leading-tight">Sastrería<br/>Artesanal</h2>
            <div className="w-8 h-px bg-white/40 mb-6 group-hover:w-16 transition-all duration-500" />
            <Link href="/sastreria" className="text-xs tracking-[0.3em] text-white/80 hover:text-white transition-colors border-b border-white/30 pb-1">CONOCER MÁS</Link>
          </div>
        </div>
        <div className="relative aspect-[3/4] overflow-hidden group cursor-pointer">
          <img
            src="https://www.sastreriaprats.com/cdn/shop/files/recursos_taller_-6.jpg?v=1718892990&width=1200"
            alt="Boutique"
            className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/45 transition-colors duration-500" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
            <p className="text-xs tracking-[0.4em] text-white/60 mb-4">LISTA PARA LLEVAR</p>
            <h2 className="font-serif text-4xl md:text-5xl font-light text-white mb-6 leading-tight">Boutique</h2>
            <div className="w-8 h-px bg-white/40 mb-6 group-hover:w-16 transition-all duration-500" />
            <Link href="/boutique" className="text-xs tracking-[0.3em] text-white/80 hover:text-white transition-colors border-b border-white/30 pb-1">VER COLECCIÓN</Link>
          </div>
        </div>
      </section>

      {/* DESTACADOS */}
      <section className="py-24 px-8 md:px-16 bg-white">
        <div className="flex items-end justify-between mb-12">
          <div>
            <p className="text-xs tracking-[0.3em] text-gray-400 mb-3">NUEVA COLECCIÓN</p>
            <h2 className="font-serif text-4xl font-light text-[#1a2744]">Destacados</h2>
          </div>
          <Link href="/boutique" className="text-xs tracking-[0.2em] text-[#1a2744] border-b border-[#1a2744]/30 pb-1 hover:border-[#1a2744] transition-colors">VER TODO</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { img: 'https://www.sastreriaprats.com/cdn/shop/files/TEBA-PRATS-CHEVIOT-MARRON_1.jpg?v=1761736182&width=600', name: 'Teba Cheviot Marrón', price: '590,00 €' },
            { img: 'https://www.sastreriaprats.com/cdn/shop/files/PANTALON-PANA-AZUL-CENIDOR_1_1ea20243-cf1a-42ee-902c-2b92c6383d3b.jpg?v=1761670040&width=600', name: 'Pantalón Pana Azul', price: '225,00 €' },
            { img: 'https://www.sastreriaprats.com/cdn/shop/files/MENINA_-_PRATS_389bd184-3fe5-4fa5-a9f0-0d28a69d5626.jpg?v=1718899181&width=600', name: 'El Viso', price: '' },
            { img: 'https://www.sastreriaprats.com/cdn/shop/files/DIEGO_PRATS-76.jpg?v=1718899328&width=600', name: 'Wellington', price: '' },
          ].map((item, i) => (
            <div key={i} className="group cursor-pointer">
              <div className="aspect-[3/4] overflow-hidden bg-gray-100">
                <img src={item.img} alt={item.name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
              </div>
              <div className="mt-4">
                <p className="text-sm font-light text-[#1a2744]">{item.name}</p>
                {item.price && <p className="text-sm text-gray-500 mt-1">{item.price}</p>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* TIENDAS */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-100">
        <div className="relative aspect-video overflow-hidden group bg-gray-200">
          <img src="https://www.sastreriaprats.com/cdn/shop/files/MENINA_-_PRATS_389bd184-3fe5-4fa5-a9f0-0d28a69d5626.jpg?v=1718899181&width=1200" alt="El Viso" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-xs tracking-[0.3em] text-white/60 mb-3">ESPACIO</p>
            <h3 className="font-serif text-3xl font-light text-white mb-5">El Viso</h3>
            <a href="https://maps.app.goo.gl/Vf8puqTToyqvTirq5" target="_blank" rel="noopener noreferrer" className="border border-white/60 px-6 py-2 text-xs tracking-[0.2em] text-white hover:bg-white hover:text-[#1a2744] transition-all">CÓMO LLEGAR</a>
          </div>
        </div>
        <div className="relative aspect-video overflow-hidden group bg-gray-200">
          <img src="https://www.sastreriaprats.com/cdn/shop/files/DIEGO_PRATS-76.jpg?v=1718899328&width=1200" alt="Wellington" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-xs tracking-[0.3em] text-white/60 mb-3">ESPACIO</p>
            <h3 className="font-serif text-3xl font-light text-white mb-5">Wellington</h3>
            <a href="https://maps.app.goo.gl/Cd36bN32ctpTmtub8" target="_blank" rel="noopener noreferrer" className="border border-white/60 px-6 py-2 text-xs tracking-[0.2em] text-white hover:bg-white hover:text-[#1a2744] transition-all">CÓMO LLEGAR</a>
          </div>
        </div>
      </section>

      {/* RESERVA CTA */}
      <section className="bg-[#1a2744] py-24 px-8 text-center">
        <p className="text-xs tracking-[0.4em] text-white/40 mb-4">SASTRERÍA A MEDIDA</p>
        <h2 className="font-serif text-4xl font-light text-white mb-6">Empieza tu traje perfecto</h2>
        <p className="text-sm text-white/60 mb-10 max-w-md mx-auto">Visítanos en nuestras boutiques de Madrid y descubre la experiencia de la sastrería artesanal.</p>
        <Link href="/reservar" className="inline-block bg-white text-[#1a2744] px-10 py-4 text-xs tracking-[0.3em] hover:bg-white/90 transition-colors">RESERVAR CITA</Link>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#111827] py-16 px-8 md:px-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div>
            <Image src="/logo-prats.png" alt="Prats" width={80} height={40} style={{ objectFit: 'contain', height: 40, width: 'auto', filter: 'invert(1) brightness(2)' }} />
            <p className="text-xs text-gray-500 mt-3 leading-relaxed">Sastrería de lujo en Madrid desde 1985.</p>
          </div>
          <div>
            <p className="text-xs tracking-[0.2em] text-gray-400 mb-4">SASTRERÍA</p>
            <div className="space-y-2">
              <Link href="/sastreria" className="block text-xs text-gray-500 hover:text-white transition-colors">A Medida Artesanal</Link>
              <Link href="/sastreria" className="block text-xs text-gray-500 hover:text-white transition-colors">Made to Measure</Link>
              <Link href="/reservar" className="block text-xs text-gray-500 hover:text-white transition-colors">Reservar Cita</Link>
            </div>
          </div>
          <div>
            <p className="text-xs tracking-[0.2em] text-gray-400 mb-4">BOUTIQUE</p>
            <div className="space-y-2">
              <Link href="/boutique" className="block text-xs text-gray-500 hover:text-white transition-colors">Nueva Colección</Link>
              <Link href="/boutique" className="block text-xs text-gray-500 hover:text-white transition-colors">Trajes</Link>
              <Link href="/boutique" className="block text-xs text-gray-500 hover:text-white transition-colors">Americanas</Link>
              <Link href="/boutique" className="block text-xs text-gray-500 hover:text-white transition-colors">Accesorios</Link>
            </div>
          </div>
          <div>
            <p className="text-xs tracking-[0.2em] text-gray-400 mb-4">CONTACTO</p>
            <div className="space-y-2">
              <p className="text-xs text-gray-500">info@sastreriaprats.com</p>
              <p className="text-xs text-gray-500">+34 669 98 55 47</p>
              <p className="text-xs text-gray-500">Lun–Vie 10:00–20:00</p>
              <p className="text-xs text-gray-500">Sáb 10:00–14:30</p>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 pt-8 flex items-center justify-between">
          <p className="text-xs text-gray-600">© 2026 Sastrería Prats. Todos los derechos reservados.</p>
          <div className="flex gap-6">
            <a href="https://instagram.com/sastreriaprats" target="_blank" rel="noopener noreferrer" className="text-xs text-gray-600 hover:text-white transition-colors">Instagram</a>
            <a href="https://facebook.com/sastreriafprats" target="_blank" rel="noopener noreferrer" className="text-xs text-gray-600 hover:text-white transition-colors">Facebook</a>
          </div>
        </div>
      </footer>
    </main>
  )
}
