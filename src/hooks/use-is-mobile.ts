import { useState, useEffect } from 'react'

/** Devuelve true cuando el viewport es menor que `breakpoint` (por defecto 768px, el `md` de Tailwind). */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [breakpoint])
  return isMobile
}
