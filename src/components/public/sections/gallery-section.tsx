import { cn } from "@/lib/utils"

const galleryItems = [
  { id: 1, span: "col-span-2 row-span-2", alt: "Detalle de sastrería 1" },
  { id: 2, span: "", alt: "Detalle de sastrería 2" },
  { id: 3, span: "", alt: "Detalle de sastrería 3" },
  { id: 4, span: "", alt: "Detalle de sastrería 4" },
  { id: 5, span: "", alt: "Detalle de sastrería 5" },
  { id: 6, span: "", alt: "Detalle de sastrería 6" },
  { id: 7, span: "", alt: "Detalle de sastrería 7" },
  { id: 8, span: "", alt: "Detalle de sastrería 8" },
]

export function GallerySection() {
  return (
    <section className="py-20 sm:py-24 bg-prats-cream/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl sm:text-4xl font-serif text-prats-navy text-center mb-12">
          Cada detalle importa
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 auto-rows-[minmax(160px,auto)]">
          {galleryItems.map((item) => (
            <div
              key={item.id}
              className={cn(
                "bg-gray-300 rounded-lg overflow-hidden aspect-square min-h-[160px]",
                "flex items-center justify-center text-gray-500 text-sm",
                item.span
              )}
              role="img"
              aria-label={item.alt}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
