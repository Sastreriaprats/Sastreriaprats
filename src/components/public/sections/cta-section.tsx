import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export function CtaSection() {
  return (
    <section
      className="py-20 sm:py-24 bg-prats-cream/50"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-4xl font-serif text-prats-navy mb-4">
          ¿Listo para tu primer traje a medida?
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto mb-8">
          Reserva una cita en nuestro taller y descubre la diferencia de vestir
          una prenda hecha exclusivamente para ti.
        </p>

        <Button
          asChild
          className="bg-prats-navy hover:bg-prats-navy-light text-white px-8 py-6 text-base font-medium"
        >
          <Link href="/contacto" className="inline-flex items-center gap-2">
            Reservar cita
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>

        <p className="mt-6 text-prats-navy font-medium">
          O llámanos:{" "}
          <a
            href="tel:+34931234567"
            className="hover:text-prats-gold transition-colors"
          >
            +34 931 234 567
          </a>
        </p>
      </div>
    </section>
  )
}
