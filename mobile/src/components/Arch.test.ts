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
    expect(cmds[0]).toEqual(['M', '0', '50'])
    expect(cmds[cmds.length - 1]).toEqual(['Z'])
    expect(cmds.map((c) => c[0]).join('')).toBe('MALALALAZ')
  })

  it('crowns the niche with a semicircle of radius w/2, whichever the height', () => {
    for (const h of [100, 120, 200]) {
      const [, crownLeft] = commands(archPath(100, h))
      // A rx ry rot large sweep x y
      expect(crownLeft).toEqual(['A', '50', '50', '0', '0', '1', '50', '0'])
    }
  })

  it('reaches the right wall and closes on 3px feet', () => {
    const cmds = commands(archPath(100, 120))
    expect(cmds[3]).toEqual(['A', '50', '50', '0', '0', '1', '100', '50'])
    expect(cmds[4]).toEqual(['L', '100', '117'])
    expect(cmds[5]).toEqual(['A', '3', '3', '0', '0', '1', '97', '120'])
    expect(cmds[6]).toEqual(['L', '3', '120'])
  })

  it('gives the Mirror the same crown: one formula only', () => {
    const [, crown, , , , corner] = commands(archPath(100, 150, 'mirror'))
    expect(crown).toEqual(['A', '50', '50', '0', '0', '1', '50', '0'])
    expect(corner[1]).toBe('3')
  })

  it('insets every edge for the bezel stroke', () => {
    const cmds = commands(archPath(100, 120, 'niche', 2))
    expect(cmds[0]).toEqual(['M', '2', '50'])
    expect(cmds[1]).toEqual(['A', '48', '48', '0', '0', '1', '50', '2'])
    expect(cmds[4]).toEqual(['L', '98', '116'])
  })
})
