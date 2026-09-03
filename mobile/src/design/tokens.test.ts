import { alpha, dark, light, rgbaParts } from './tokens'

describe('rgbaParts', () => {
  it('splits an rgba token into hex and alpha for SVG stops', () => {
    expect(rgbaParts('rgba(228, 217, 192, 0.85)')).toEqual({ color: '#e4d9c0', opacity: 0.85 })
    expect(rgbaParts('rgba(255,255,255,0.16)')).toEqual({ color: '#ffffff', opacity: 0.16 })
  })

  it('treats rgb() as opaque and pads single-digit channels', () => {
    expect(rgbaParts('rgb(1, 2, 3)')).toEqual({ color: '#010203', opacity: 1 })
  })

  it('passes anything else through untouched', () => {
    expect(rgbaParts('#221B12')).toEqual({ color: '#221B12', opacity: 1 })
  })

  it('reads every wash and edge token in both palettes', () => {
    for (const p of [light, dark]) {
      for (const token of [p.nicheEdge, p.sheen, p.washA, p.washB]) {
        const { color, opacity } = rgbaParts(token)
        expect(color).toMatch(/^#[0-9a-f]{6}$/)
        expect(opacity).toBeGreaterThan(0)
        expect(opacity).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('alpha', () => {
  it('washes a six-digit hex', () => {
    expect(alpha('#221B12', 0.45)).toBe('rgba(34, 27, 18, 0.45)')
    expect(alpha('#C8A45E', 1)).toBe('rgba(200, 164, 94, 1)')
  })

  it('expands a three-digit hex', () => {
    expect(alpha('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)')
    expect(alpha('#08f', 0.2)).toBe('rgba(0, 136, 255, 0.2)')
  })

  it('accepts the hash-less form', () => {
    expect(alpha('ECE5D8', 0.6)).toBe('rgba(236, 229, 216, 0.6)')
  })
})
