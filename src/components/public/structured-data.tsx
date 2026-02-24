const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sastreriaprats.com'

export function LocalBusinessSchema() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'TailorShop',
    name: 'Sastrería Prats',
    description: 'Sastrería de lujo en Madrid. Trajes a medida, arreglos y boutique.',
    url: BASE_URL,
    telephone: '+34914356789',
    email: 'info@sastreriaprats.com',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Calle de Serrano 82',
      addressLocality: 'Madrid',
      postalCode: '28006',
      addressCountry: 'ES',
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '10:00',
        closes: '20:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'Saturday',
        opens: '10:00',
        closes: '14:00',
      },
    ],
    priceRange: '€€€€',
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
