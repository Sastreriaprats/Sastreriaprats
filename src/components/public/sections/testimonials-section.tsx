import { Quote } from "lucide-react"
import { cn } from "@/lib/utils"

const testimonials = [
  {
    quote:
      "Mi experiencia en Prats ha sido excepcional. El traje que me confeccionaron supera todas mis expectativas. La atención al detalle y el trato personalizado hacen que cada visita sea un placer.",
    author: "Carlos Martínez",
    role: "Empresario",
  },
  {
    quote:
      "Llevo años confiando en Prats para mi vestuario. La calidad de las telas y la perfección del corte son incomparables. Una inversión que vale cada céntimo.",
    author: "Antonio García",
    role: "Abogado",
  },
  {
    quote:
      "Encontré en Prats no solo un sastre, sino un asesor de estilo. Me ayudaron a definir mi imagen profesional con prendas que me hacen sentir seguro cada día.",
    author: "Miguel Fernández",
    role: "Director financiero",
  },
]

export function TestimonialsSection() {
  return (
    <section className="bg-prats-navy py-20 sm:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-serif text-white mb-4">
            Lo que dicen nuestros clientes
          </h2>
          <p className="text-white/70 max-w-2xl mx-auto">
            La satisfacción de nuestros clientes es el mejor aval de nuestro
            trabajo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className={cn(
                "p-8 rounded-xl border border-white/10",
                "bg-white/5 backdrop-blur-sm"
              )}
            >
              <Quote className="h-10 w-10 text-prats-gold mb-4" />
              <blockquote className="text-white/90 text-lg leading-relaxed mb-6">
                &ldquo;{testimonial.quote}&rdquo;
              </blockquote>
              <div>
                <cite className="not-italic font-semibold text-white">
                  {testimonial.author}
                </cite>
                <p className="text-prats-gold text-sm mt-1">{testimonial.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
