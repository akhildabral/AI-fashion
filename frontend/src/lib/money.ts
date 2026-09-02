// Money, in the member's currency. The profile carries an ISO code; until
// it's set (or on public pages) we guess from the browser's region, falling
// back to dirhams. One formatter, used everywhere a figure is printed.

export const CURRENCIES: { code: string; name: string }[] = [
  { code: 'AED', name: 'UAE dirham' },
  { code: 'SAR', name: 'Saudi riyal' },
  { code: 'QAR', name: 'Qatari riyal' },
  { code: 'KWD', name: 'Kuwaiti dinar' },
  { code: 'BHD', name: 'Bahraini dinar' },
  { code: 'OMR', name: 'Omani rial' },
  { code: 'INR', name: 'Indian rupee' },
  { code: 'PKR', name: 'Pakistani rupee' },
  { code: 'USD', name: 'US dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British pound' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'AUD', name: 'Australian dollar' },
  { code: 'SGD', name: 'Singapore dollar' },
  { code: 'JPY', name: 'Japanese yen' },
  { code: 'CHF', name: 'Swiss franc' },
  { code: 'ZAR', name: 'South African rand' },
  { code: 'TRY', name: 'Turkish lira' },
  { code: 'MYR', name: 'Malaysian ringgit' },
  { code: 'HKD', name: 'Hong Kong dollar' },
]

const BY_REGION: Record<string, string> = {
  AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR',
  IN: 'INR', PK: 'PKR', LK: 'LKR', BD: 'BDT', NP: 'NPR',
  US: 'USD', CA: 'CAD', AU: 'AUD', NZ: 'NZD', GB: 'GBP', IE: 'EUR',
  DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', PT: 'EUR', FI: 'EUR', GR: 'EUR',
  CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', TR: 'TRY',
  SG: 'SGD', MY: 'MYR', ID: 'IDR', PH: 'PHP', TH: 'THB', VN: 'VND', HK: 'HKD', JP: 'JPY', KR: 'KRW', CN: 'CNY',
  ZA: 'ZAR', NG: 'NGN', KE: 'KES', EG: 'EGP', MX: 'MXN', BR: 'BRL',
}

const FALLBACK = 'AED'

/** The browser's region, as a currency; dirhams when it doesn't say. */
export function guessCurrency(): string {
  try {
    const langs = typeof navigator !== 'undefined' ? [navigator.language, ...(navigator.languages ?? [])] : []
    for (const l of langs) {
      const loc = new Intl.Locale(l)
      const region = (typeof loc.maximize === 'function' ? loc.maximize() : loc).region
      if (region && BY_REGION[region]) return BY_REGION[region]
    }
  } catch {
    /* fall through */
  }
  return FALLBACK
}

let current: string | null = null

/** Set once the profile is known; components print through money() after. */
export function setCurrentCurrency(code: string | null | undefined) {
  current = code && /^[A-Z]{3}$/.test(code) ? code : null
}

export function getCurrency(): string {
  return current ?? guessCurrency()
}

const fmtCache = new Map<string, Intl.NumberFormat>()

function formatter(code: string, digits: number): Intl.NumberFormat {
  const key = `${code}:${digits}`
  let f = fmtCache.get(key)
  if (!f) {
    try {
      f = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: digits })
    } catch {
      f = new Intl.NumberFormat('en', { style: 'currency', currency: FALLBACK, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: digits })
    }
    fmtCache.set(key, f)
  }
  return f
}

/** "د.إ41,460" / "₹2,490" / "$18" — whole units unless told otherwise. */
export function money(n: number, opts: { digits?: number; currency?: string } = {}): string {
  return formatter(opts.currency ?? getCurrency(), opts.digits ?? 0).format(n)
}

/** Just the symbol, for input adornments. */
export function currencySymbol(code = getCurrency()): string {
  const parts = formatter(code, 0).formatToParts(0)
  return parts.find((p) => p.type === 'currency')?.value ?? code
}
