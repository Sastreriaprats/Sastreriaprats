export function PratsSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-8 w-8', md: 'h-16 w-16', lg: 'h-24 w-24' }
  return <img src="/spinner-prats.gif" alt="Cargando..." className={sizes[size]} />
}
