// Renders a few looks in both modes for the test user, side by side, so the
// choice between text-only and reference-image try-on is made on evidence.
import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../src/lib/prisma'
import { readStored } from '../src/lib/storage'
import { generateOutfitTryOn, type TryOnMode } from '../src/services/tryon.service'

const OUT = process.env.OUT ?? '/tmp/tryon-compare'
const EMAIL = process.env.EMAIL ?? 'smoke@test.dev'

async function main() {
  const user = await prisma.user.findFirst({ where: { email: EMAIL } })
  if (!user?.photoPath) throw new Error('test user has no photo')
  const items = await prisma.wardrobeItem.findMany({ where: { userId: user.id, owned: true, status: 'ready' } })
  const by = (c: string) => items.filter((i) => i.category === c)
  const pick = (process.env.PICK ?? '').split(',').filter(Boolean)
  const looks = pick.length
    ? [pick.map((sub) => items.find((i) => (i.subtype ?? '').toLowerCase().includes(sub))).filter(Boolean) as typeof items]
    : [
        [by('top')[0], by('bottom')[0], by('footwear')[0]].filter(Boolean),
        [by('top')[1] ?? by('top')[0], by('bottom')[1] ?? by('bottom')[0]].filter(Boolean),
      ]
  fs.mkdirSync(OUT, { recursive: true })
  const modes: TryOnMode[] = (process.env.MODES ?? 'text,references').split(',') as TryOnMode[]
  for (const [li, look] of looks.entries()) {
    console.log(`look ${li + 1}:`, look.map((i) => i.subtype ?? i.category).join(' + '))
    for (const mode of modes) {
      const t0 = Date.now()
      try {
        const r = await generateOutfitTryOn(user.photoPath, look, mode)
        const buf = await readStored(r.url)
        const file = path.join(OUT, `${process.env.TAG ?? `look${li + 1}`}-${mode}.png`)
        fs.writeFileSync(file, buf)
        console.log(`  ${mode}: ${Math.round((Date.now() - t0) / 1000)}s → ${file}`)
      } catch (e) {
        console.log(`  ${mode}: FAILED ${(e as Error).message.slice(0, 120)}`)
      }
    }
  }
  await prisma.$disconnect()
}
void main()
