import Link from 'next/link'
import { getWebCategories } from '@/actions/cms'

// Enlaces de categorías renderizados en servidor. El menú del header vive en un
// Sheet de Radix que solo se monta en el DOM al abrirlo, así que los enlaces de
// este componente (y los del footer) son los únicos que ven los rastreadores.
// No convertir en componente cliente ni cargar en diferido.
export async function CategoryLinks({ current }: { current?: string }) {
  const categories = await getWebCategories()
  if (categories.length === 0) return null

  const active = current
    ? categories.find(c => c.slug === current || c.children?.some(s => s.slug === current))
    : undefined
  const subcategories = active?.children ?? []

  return (
    <nav aria-label="Categorías" className="mx-auto max-w-5xl">
      <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2">
        {categories.map(c => {
          const isActive = c.slug === active?.slug
          return (
            <li key={c.slug}>
              <Link
                href={`/boutique/categoria/${c.slug}`}
                className={`text-[11px] font-medium tracking-[0.15em] uppercase transition-colors ${
                  isActive
                    ? 'text-black underline underline-offset-4'
                    : 'text-gray-500 hover:text-black'
                }`}
              >
                {c.name}
              </Link>
            </li>
          )
        })}
      </ul>
      {subcategories.length > 0 && (
        <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2">
          {subcategories.map(s => {
            const isActive = s.slug === current
            return (
              <li key={s.slug}>
                <Link
                  href={`/boutique/categoria/${s.slug}`}
                  className={`text-[11px] tracking-[0.1em] uppercase transition-colors ${
                    isActive
                      ? 'text-black underline underline-offset-4'
                      : 'text-gray-400 hover:text-black'
                  }`}
                >
                  {s.name}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </nav>
  )
}
