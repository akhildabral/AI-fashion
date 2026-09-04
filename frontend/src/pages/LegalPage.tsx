import { Link } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { PageShell, SectionHead } from '../components/ui'

// The two plain pages every door needs. Written to be read, not scrolled
// past: what we keep, why, and how you take it back.

const UPDATED = '2 September 2026'

/** A prose section: the Bodoni head, then 15px body. Sections sit 40 apart on a hairline. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-ink/10 py-5 first:border-t-0 first:pt-0">
      <SectionHead title={title} />
      <div className="space-y-3 text-[15px] leading-relaxed text-ink/70 [&_b]:font-semibold [&_b]:text-ink">{children}</div>
    </section>
  )
}

function Shell({ eyebrow, title, lead, children }: { eyebrow: string; title: string; lead: string; children: React.ReactNode }) {
  return (
    <PageShell narrow>
      <header>
        <p className="animate-rise eyebrow">{eyebrow}</p>
        <h1 className="page-title mt-2 animate-rise-1 [text-wrap:balance]">{title}</h1>
        <p className="mt-3 animate-rise-2 font-display text-xl italic text-ink/55">{lead}</p>
        <p className="mt-2 animate-rise-2 text-xs text-ink/45">Last changed {UPDATED}.</p>
      </header>
      <div className="mt-10 animate-rise-3">{children}</div>
      <footer className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-ink/10 pt-5 text-sm text-ink/55">
        <Link to="/landing" className="font-semibold text-accent-text underline-offset-4 hover:underline">
          The front door
        </Link>
        <Link to="/privacy" className="transition-colors hover:text-ink">
          Privacy
        </Link>
        <Link to="/terms" className="transition-colors hover:text-ink">
          Terms
        </Link>
      </footer>
    </PageShell>
  )
}

export function PrivacyPage() {
  usePageTitle('Privacy')
  return (
    <Shell eyebrow="Privacy" title="What we keep, and why." lead="A stylist has to know your closet. Nobody else does.">
      <Section title="What you give us">
        <p>
          <b>Your account:</b> an email address, a name, a password we store only as a hash, or a Google sign-in. <b>Your closet:</b> the photographs of clothes you upload, and what we work out about them (colour, cut, warmth). <b>Your measure:</b> height, build, sizes, tone, and the colours you never want to see. <b>Your record:</b> which pieces you wore on which day, the weather that day, and whether you would wear it again. <b>Your photo:</b> only if you upload one, and only with your consent, so the Mirror can show a look on you.
        </p>
      </Section>
      <Section title="What we do with it">
        <p>Compose your daily brief, keep score of what you wear, pack a suitcase from what you own, and show a look on you in the Mirror. That is the whole list. We do not sell it, rent it, or use it to advertise to you.</p>
        <p>
          To do the composing, some of it goes to model providers as a request and comes back as an answer. They see the descriptions of your pieces and, for a Mirror render, the photo you chose. They do not get your name or your email, and we use providers that do not train on what we send.
        </p>
      </Section>
      <Section title="Who sees what">
        <p>
          <b>Nobody sees your measure, your record or your photo.</b> Friends in your Circle see your name, your room, the pieces you have made public, and the looks you choose to share. A look you share to a link is visible to whoever has the link. You can take a look down, make a piece private, and leave a circle, at any time.
        </p>
      </Section>
      <Section title="What we don’t collect">
        <p>No advertising trackers. No fingerprinting. No location from your phone: the weather in your brief comes from the city you typed. Push notifications only if you switch them on, and they carry nothing but the nudge.</p>
      </Section>
      <Section title="Taking it back">
        <p>
          Every piece, every day in the record, and every photo can be deleted from inside the app. Deleting your photo deletes every render made from it. Deleting your account (Profile → Account) removes the account, the closet, the record and every file, and it is not reversible. Backups that still hold a copy are overwritten within thirty days.
        </p>
      </Section>
      <Section title="Where it lives">
        <p>On servers we run, encrypted in transit. Payment details, when billing is on, are handled by the payment provider and never touch our servers.</p>
      </Section>
      <Section title="Questions">
        <p>Reply to any email we send you and a person will answer. If this page changes in a way that matters, we will say so the next time you sign in.</p>
      </Section>
    </Shell>
  )
}

export function TermsPage() {
  usePageTitle('Terms')
  return (
    <Shell eyebrow="Terms" title="The house rules." lead="Short, because there is not much to say.">
      <Section title="What this is">
        <p>A personal stylist for the clothes you own. It suggests; you decide. An outfit in a brief, a verdict from your circle, or a render in the Mirror is advice, not a promise about how anything will fit, look, or hold up.</p>
      </Section>
      <Section title="Your account">
        <p>Membership is by invitation. One person per account. Keep your password to yourself; what happens under your sign-in is yours. You must be sixteen or older to have an account.</p>
      </Section>
      <Section title="Your things">
        <p>
          Everything you upload stays yours. You give us the permission we need to store it, work on it, and show it back to you, and to show your shared looks to the people you share them with. Upload only clothes and photos that are yours to upload. Don’t upload other people’s photos as your own.
        </p>
      </Section>
      <Section title="The Circle">
        <p>Be decent. Nothing unkind, nothing pretending to be someone else, nothing that isn’t clothes. Mute, block and report exist for a reason, and an account that keeps earning reports will be closed.</p>
      </Section>
      <Section title="Billing">
        <p>Where a plan has a price, it is shown before you pay, renews until you cancel, and can be cancelled from the plan page at any time. A cancelled plan runs to the end of the period it was paid for.</p>
      </Section>
      <Section title="Ending things">
        <p>You can delete your account at any time, and everything goes with it. We can close an account that breaks these rules. We can also change the product, and these rules, and will say so when we do.</p>
      </Section>
      <Section title="The fine print">
        <p>The service is offered as it is, without guarantees. Our responsibility to you is limited to what you have paid us in the last twelve months. Nothing here removes rights the law gives you where you live.</p>
      </Section>
    </Shell>
  )
}
