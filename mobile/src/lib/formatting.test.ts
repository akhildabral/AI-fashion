// The shared formatters, wired the way ProfileProvider wires them: device
// locales as the currency hint, then the profile's own currency and units.
import {
  currencySymbol,
  getCurrency,
  guessCurrency,
  money,
  setCurrentCurrency,
  setLocaleHints,
} from '@zauq/shared/money'
import { setCurrentUnits, temp, tempRange } from '@zauq/shared/units'

describe('money', () => {
  beforeEach(() => {
    setLocaleHints([])
    setCurrentCurrency(null)
  })

  it('guesses the currency from the device locale until the profile says', () => {
    setLocaleHints(['en-AE'])
    expect(guessCurrency()).toBe('AED')
    setLocaleHints(['en-IN'])
    expect(getCurrency()).toBe('INR')
  })

  it('falls back to dirhams when the locale has no region it knows', () => {
    setLocaleHints(['xx'])
    expect(guessCurrency()).toBe('AED')
  })

  it('prints in the profile currency once set, whole units by default', () => {
    setCurrentCurrency('INR')
    expect(money(2490)).toBe('₹2,490')
    expect(money(18.4, { digits: 1 })).toBe('₹18.4')
    expect(currencySymbol()).toBe('₹')
  })

  it('ignores a malformed currency code and keeps the guess', () => {
    setLocaleHints(['en-GB'])
    setCurrentCurrency('rupees')
    expect(getCurrency()).toBe('GBP')
    expect(money(18)).toBe('£18')
  })

  it('takes a one-off currency', () => {
    expect(money(41460, { currency: 'USD' })).toBe('$41,460')
  })
})

describe('units', () => {
  it('prints Celsius by default and Fahrenheit when the profile is imperial', () => {
    setCurrentUnits(null)
    expect(temp(24)).toBe('24°')
    setCurrentUnits('imperial')
    expect(temp(24)).toBe('75°')
    expect(tempRange(22, 28)).toBe('72–82°')
    setCurrentUnits('metric')
    expect(tempRange(22.4, 27.6)).toBe('22–28°')
  })
})
