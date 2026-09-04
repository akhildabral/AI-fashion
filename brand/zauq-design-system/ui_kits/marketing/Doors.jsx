import React from 'react'
import { Field } from '../../components/forms/Field.jsx'
import { Button } from '../../components/actions/Button.jsx'
import { Alert } from '../../components/feedback/Alert.jsx'

/** The two doors: the waitlist, and a friend's invite. */
export function Doors({ compact = false }) {
  const [email, setEmail] = React.useState('')
  const [done, setDone] = React.useState(false)
  const [codeOpen, setCodeOpen] = React.useState(false)

  if (done) {
    return (
      <div style={{ maxWidth: '28rem', borderRadius: 'var(--radius)', border: 'var(--border-hair) solid var(--border-accent)', background: 'rgb(var(--c-iris-soft) / 0.6)', padding: 'var(--space-4) var(--space-5)' }}>
        <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-body-lg)', fontWeight: 'var(--weight-medium)', color: 'var(--text-strong)' }}>You&rsquo;re on the list.</p>
        <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-ui)', color: 'var(--text-muted)' }}>We open a few doors each week. Yours will come by email.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', maxWidth: '28rem', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <form onSubmit={(e) => { e.preventDefault(); if (email.trim()) setDone(true) }} style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Field id={compact ? 'email-2' : 'email'} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={{ flex: 1, minWidth: 0 }} />
        <Button variant="primary" type="submit" style={{ flexShrink: 0 }}>Join the waitlist</Button>
      </form>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 var(--space-4)', fontSize: 'var(--text-ui)' }}>
        <button type="button" onClick={() => setCodeOpen((v) => !v)} className="zq-press" style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 'inherit', fontWeight: 'var(--weight-semibold)', color: 'var(--text-accent)' }}>
          Have an invite? Come in &rarr;
        </button>
        <span style={{ color: 'var(--text-faint)' }}>Invite-only while we grow.</span>
      </div>
      {codeOpen && (
        <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Field id={compact ? 'code-2' : 'code'} size="sm" placeholder="your friend&rsquo;s code or link" style={{ flex: 1, minWidth: 0 }} />
          <Button variant="ghost" size="sm" type="submit" style={{ flexShrink: 0 }}>Come in</Button>
        </form>
      )}
    </div>
  )
}
