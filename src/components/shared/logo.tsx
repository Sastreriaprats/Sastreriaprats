import Image from 'next/image'
import { cn } from '@/lib/utils'

interface LogoProps {
  variant?: 'dark' | 'light'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  /** Muestra el subtítulo "Madrid" debajo del logo */
  showTagline?: boolean
}

const SIZES = {
  sm:  { w: 56,  h: 28 },
  md:  { w: 80,  h: 40 },
  lg:  { w: 120, h: 60 },
  xl:  { w: 180, h: 90 },
}

export function Logo({ variant = 'dark', size = 'md', className, showTagline = false }: LogoProps) {
  const { w, h } = SIZES[size]

  return (
    <span className={cn('inline-flex flex-col items-start', className)}>
      <Image
        src="/logo-prats.png"
        alt="Prats"
        width={w}
        height={h}
        priority
        style={{
          objectFit: 'contain',
          filter: variant === 'light' ? 'invert(1) brightness(2)' : 'none',
          height: h,
          width: 'auto',
        }}
      />
      {showTagline && (
        <span
          className={cn(
            'text-[9px] tracking-[0.35em] uppercase mt-0.5',
            variant === 'dark' ? 'text-prats-gold' : 'text-white/70'
          )}
        >
          Madrid · Est. 1985
        </span>
      )}
    </span>
  )
}
