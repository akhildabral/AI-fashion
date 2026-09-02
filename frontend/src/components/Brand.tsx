// The ZAUQ identity, as live type and geometry. From the brand guide: the
// wordmark is Playfair Display Regular in caps, kerned ZA .24em, AU .20em,
// UQ .16em, alone by default (no rule, no tagline); the ceremonial form adds
// a gold rule under it, at 200px and up. The mark is the arch, 3:4, with the
// script ذوق in Noto Nastaliq Urdu and a short rule, or empty (the mirror),
// or bare (the favicon). Gold #D8B26A, ink #0B0A09, cream #F2EDE3.

export const BRAND = { gold: '#D8B26A', ink: '#0B0A09', cream: '#F2EDE3', neutral: '#D6CFC0' } as const

const WORD_FONT = "'Playfair Display', Georgia, serif"
const SCRIPT_FONT = "'Noto Nastaliq Urdu', serif"

export function Wordmark({ className = '', ceremonial = false }: { className?: string; ceremonial?: boolean }) {
  const word = (
    <span className={`inline-block select-none whitespace-nowrap font-normal uppercase leading-none ${className}`} style={{ fontFamily: WORD_FONT }} aria-label="ZAUQ" translate="no">
      <span aria-hidden style={{ letterSpacing: '.24em' }}>Z</span>
      <span aria-hidden style={{ letterSpacing: '.20em' }}>A</span>
      <span aria-hidden style={{ letterSpacing: '.16em' }}>U</span>
      <span aria-hidden>Q</span>
    </span>
  )
  if (!ceremonial) return word
  return (
    <span className="inline-flex flex-col items-center gap-[.42em]">
      {word}
      <span aria-hidden className="block h-[2px] w-[1.55em]" style={{ background: BRAND.gold }} />
    </span>
  )
}

/**
 * The arch mark. `script` carries ذوق and its rule; `mirror` is the empty
 * arch; `bare` is the favicon's arch alone. Stroke follows `color` (gold by
 * default); the script follows `ink`.
 */
export function ArchMark({ variant = 'script', size = 40, color = BRAND.gold, ink, className = '' }: { variant?: 'script' | 'mirror' | 'bare'; size?: number; color?: string; ink?: string; className?: string }) {
  const h = Math.round((size * 4) / 3)
  return (
    <svg width={size} height={h} viewBox="0 0 300 400" className={className} aria-hidden focusable="false">
      <path d="M4 392V150A146 146 0 0 1 296 150V392A4 4 0 0 1 292 396H8A4 4 0 0 1 4 392Z" fill="none" stroke={color} strokeWidth={variant === 'bare' ? 6 : 4} />
      {variant === 'script' && (
        <>
          <text x="150" y="316" textAnchor="middle" fontFamily={SCRIPT_FONT} fontSize="50" fontWeight="600" fill={ink ?? 'currentColor'} direction="rtl">
            ذوق
          </text>
          <rect x="119" y="333" width="62" height="3" fill={color} />
        </>
      )}
    </svg>
  )
}
