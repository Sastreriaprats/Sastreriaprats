import Link from "next/link"
import { Scissors, Shirt, Ruler, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

const services = [
  {
    icon: Scissors,
    title: "Sastrería a medida",
    description:
      "Trajes y chaquetas confeccionados a mano con los mejores tejidos. Cada prenda se adapta perfectamente a tu anatomía y estilo.",
    href: "/sastreria",
  },
  {
    icon: Shirt,
    title: "Camisería",
    description:
      "Camisas personalizadas con cuellos, puños y tallas a tu medida. Amplia selección de telas y acabados.",
    href: "/camiseria",
  },
  {
    icon: Ruler,
    title: "Arreglos",
    description:
      "Ajustes y modificaciones para que tus prendas queden perfectas. Arreglos de pantalones, chaquetas y más.",
    href: "/arreglos",
  },
  {
    icon: Sparkles,
    title: "Boutique",
    description:
      "Descubre nuestra colección de accesorios y complementos seleccionados para completar tu vestuario.",
    href: "/boutique",
  },
] as const

export function ServicesSection() {
  return (
    <section id="services" className="bg-white py-20 sm:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-serif text-prats-navy mb-4">
            Nuestros servicios
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Ofrecemos una experiencia completa de sastrería, desde la primera
            consulta hasta la entrega de tu prenda perfecta.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {services.map((service) => (
            <Link
              key={service.href}
              href={service.href}
              className={cn(
                "group p-6 rounded-xl border border-gray-100",
                "bg-white hover:bg-gray-50/80 transition-colors duration-300",
                "flex flex-col items-center text-center"
              )}
            >
              <div
                className={cn(
                  "w-14 h-14 rounded-full flex items-center justify-center mb-4",
                  "bg-prats-navy/5 group-hover:bg-prats-gold/10 transition-colors duration-300"
                )}
              >
                <service.icon
                  className={cn(
                    "h-7 w-7 text-prats-navy group-hover:text-prats-gold transition-colors duration-300"
                  )}
                />
              </div>
              <h3 className="text-lg font-semibold text-prats-navy mb-2">
                {service.title}
              </h3>
              <p className="text-sm text-muted-foreground flex-1">
                {service.description}
              </p>
              <span className="mt-4 text-sm font-medium text-prats-gold group-hover:underline">
                Descubrir más →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
