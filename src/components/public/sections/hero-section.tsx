import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background image placeholder with navy gradient overlay */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat bg-gray-600"
        style={{ backgroundImage: "url('/images/hero-placeholder.jpg')" }}
      />
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-b",
          "from-[var(--color-prats-navy)]/80 via-[var(--color-prats-navy)]/60 to-[var(--color-prats-navy)]/90"
        )}
      />

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <p className="text-prats-gold text-sm uppercase tracking-[0.3em] mb-4">
          Desde 1985
        </p>
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-serif font-light text-white mb-6 tracking-tight">
          El arte de vestir a medida
        </h1>
        <p className="text-white/90 text-lg sm:text-xl max-w-2xl mx-auto mb-10">
          Tres generaciones dedicadas a la sastrería artesanal. Cada prenda es una
          obra única, confeccionada con precisión y pasión en nuestro taller de
          Barcelona.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Button
            asChild
            className="bg-prats-gold hover:bg-prats-gold/90 text-white border-0 px-8 py-6 text-base font-medium"
          >
            <Link href="/contacto">Reservar cita</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-2 border-white text-white hover:bg-white/10 hover:text-white px-8 py-6 text-base"
          >
            <Link href="/boutique">Descubrir colección</Link>
          </Button>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce">
        <a
          href="#services"
          className="flex flex-col items-center gap-1 text-white/70 hover:text-white transition-colors"
          aria-label="Desplazarse hacia abajo"
        >
          <ChevronDown className="h-8 w-8" />
          <span className="text-xs uppercase tracking-widest">Descubre</span>
        </a>
      </div>
    </section>
  )
}
