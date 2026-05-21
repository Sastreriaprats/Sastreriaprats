type CardIconProps = { className?: string }

function VisaIcon({ className }: CardIconProps) {
  return (
    <svg
      viewBox="0 0 48 32"
      className={className}
      aria-label="Visa"
      role="img"
    >
      <rect width="48" height="32" rx="4" fill="#1A1F71" />
      <path
        d="M19.5 21.5h-2.7l1.7-10.5h2.7l-1.7 10.5zm9.6-10.3a6.7 6.7 0 0 0-2.4-.4c-2.6 0-4.5 1.3-4.5 3.3 0 1.4 1.4 2.2 2.4 2.7 1 .5 1.4.8 1.4 1.3 0 .7-.9 1-1.7 1-1.1 0-1.7-.2-2.7-.6l-.4-.2-.4 2.4c.7.3 2 .6 3.3.6 2.8 0 4.6-1.3 4.6-3.4 0-1.2-.7-2-2.3-2.7-1-.4-1.5-.7-1.5-1.2 0-.4.5-.9 1.6-.9.9 0 1.6.2 2.1.4l.3.1.4-2.4zm6.9-.2h-2.1c-.7 0-1.2.2-1.5.9l-4 9.6h2.8l.6-1.5h3.4l.3 1.5h2.5l-2-10.5zm-3.3 6.8l1.1-2.7.2-.5.1.4.6 2.8h-2zM13.7 11l-2.6 7.1-.3-1.4c-.5-1.6-2-3.3-3.7-4.2l2.4 9h2.8L17 11h-3.3z"
        fill="#fff"
      />
    </svg>
  )
}

function MastercardIcon({ className }: CardIconProps) {
  return (
    <svg
      viewBox="0 0 48 32"
      className={className}
      aria-label="Mastercard"
      role="img"
    >
      <rect width="48" height="32" rx="4" fill="#fff" stroke="#e5e7eb" />
      <circle cx="20" cy="16" r="7" fill="#EB001B" />
      <circle cx="28" cy="16" r="7" fill="#F79E1B" />
      <path
        d="M24 10.5a7 7 0 0 0 0 11 7 7 0 0 0 0-11z"
        fill="#FF5F00"
      />
    </svg>
  )
}

function AmexIcon({ className }: CardIconProps) {
  return (
    <svg
      viewBox="0 0 48 32"
      className={className}
      aria-label="American Express"
      role="img"
    >
      <rect width="48" height="32" rx="4" fill="#006FCF" />
      <text
        x="24"
        y="19"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="700"
        fontSize="7"
        fill="#fff"
        letterSpacing="0.5"
      >
        AMEX
      </text>
    </svg>
  )
}

function MaestroIcon({ className }: CardIconProps) {
  return (
    <svg
      viewBox="0 0 48 32"
      className={className}
      aria-label="Maestro"
      role="img"
    >
      <rect width="48" height="32" rx="4" fill="#fff" stroke="#e5e7eb" />
      <circle cx="20" cy="16" r="7" fill="#0099DF" />
      <circle cx="28" cy="16" r="7" fill="#ED0006" />
      <path
        d="M24 10.5a7 7 0 0 0 0 11 7 7 0 0 0 0-11z"
        fill="#6C6BBD"
      />
    </svg>
  )
}

export function AcceptedCards({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      <VisaIcon className="h-6 w-auto" />
      <MastercardIcon className="h-6 w-auto" />
      <AmexIcon className="h-6 w-auto" />
      <MaestroIcon className="h-6 w-auto" />
    </div>
  )
}
