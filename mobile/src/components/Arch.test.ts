import { archPath } from './Arch'

// Pull the numbers out of the path so the geometry can be checked, not the string.
function commands(d: string): string[][] {
  return d
    .split(/(?=[MALZ])/)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => c.split(/\s+/))
}

describe('archPath', () => {
  it('draws a closed outline that starts on the left wall below the crown', () => {
    const d = archPath(100, 120)
    const cmds = commands(d)
    expect(cmds[0]).toEqual(['M', '0', '37.3'])
    expect(cmds[cmds.length - 1]).toEqual(['Z'])
    expect(cmds.map((c) => c[0]).join('')).toBe('MALALALAZ')
  })

  it('crowns the niche at 46% of the width across and 0.373 x width tall, whichever the height', () => {
    for (const h of [100, 120, 200]) {
      const [, crownLeft] = commands(archPath(100, h))
      // A rx ry rot large sweep x y
      expect(crownLeft).toEqual(['A', '46', '37.3', '0', '0', '1', '46', '0'])
    }
  })

  it('reaches the right wall and closes on 5px bottom corners', () => {
    const cmds = commands(archPath(100, 120))
    expect(cmds[3]).toEqual(['A', '46', '37.3', '0', '0', '1', '100', '37.3'])
    expect(cmds[4]).toEqual(['L', '100', '115'])
    expect(cmds[5]).toEqual(['A', '5', '5', '0', '0', '1', '95', '120'])
    expect(cmds[6]).toEqual(['L', '5', '120'])
  })

  it('gives the Mirror a squarer crown that scales with the height', () => {
    const [, crown, , , , corner] = commands(archPath(100, 200, 'mirror'))
    expect(crown).toEqual(['A', '48', '52', '0', '0', '1', '48', '0'])
    expect(corner[1]).toBe('6')
  })

  it('insets every edge for the bezel stroke', () => {
    const cmds = commands(archPath(100, 120, 'niche', 2))
    expect(cmds[0]).toEqual(['M', '2', '37.3'])
    expect(cmds[1]).toEqual(['A', '44', '35.3', '0', '0', '1', '46', '2'])
    expect(cmds[4]).toEqual(['L', '98', '114'])
  })
})
