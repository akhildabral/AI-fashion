// Units: metric or imperial, from the profile. Temperatures arrive in
// Celsius from the API and print in the member's units.

let current: 'metric' | 'imperial' = 'metric'

export function setCurrentUnits(units: string | null | undefined) {
  current = units === 'imperial' ? 'imperial' : 'metric'
}

/** A temperature for display: "24°" or "75°". */
export function temp(celsius: number): string {
  const v = current === 'imperial' ? Math.round((celsius * 9) / 5 + 32) : Math.round(celsius)
  return `${v}°`
}

/** A range for display: "22–28°". */
export function tempRange(minC: number, maxC: number): string {
  return `${temp(minC).slice(0, -1)}–${temp(maxC)}`
}
