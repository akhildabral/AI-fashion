import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { useAuth } from '../context/useAuth'
import { Spinner } from '../components/Spinner'
import { GoogleButton } from '../components/GoogleButton'
import { DoorShell, Or, PasswordField, SignInLink } from '../components/DoorShell'
import { getJoinInfo, joinWithCode, type JoinInfo } from '../lib/invites'

// A friend's door. Their link brought you here: no waitlist, and you land
// following each other.

export function JoinPage() {
  usePageTitle('You’re invited')
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const { user, adoptSession } = useAuth()

  const [info, setInfo] = useState<JoinInfo | null>(null)
  const [state, setState] = useState<'checking' | 'ready' | 'closed' | 'invalid'>('checking')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!code) {
      setState('invalid')
      return
    }
    getJoinInfo(code)
      .then((r) => {
        setInfo(r)
        setState(r.open ? 'ready' : 'closed')
      })
      .catch(() => setState('invalid'))
  }, [code])

  const who = info?.inviter.handle ? `@${info.inviter.handle}` : (info?.inviter.firstName ?? 'A friend')

  async function join(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await joinWithCode(code, { email: email.trim(), password, firstName: firstName.trim(), lastName: lastName.trim() || null })
      adoptSession(res.token, res.user)
      navigate('/fitting', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the door.')
    } finally {
      setBusy(false)
    }
  }

  const title =
    state === 'ready' ? (
      <>Come in, <em className="text-brass">no waiting.</em></>
    ) : state === 'closed' ? (
      <>{who}’s invites are <em className="text-brass">used up.</em></>
    ) : state === 'invalid' ? (
      <>This link isn’t <em className="text-brass">one of ours.</em></>
    ) : (
      <>Checking <em className="text-brass">the door.</em></>
    )
  const eyebrow = state === 'ready' ? `${who} invited you` : state === 'checking' ? 'One moment' : 'The door'
  const lead =
    state === 'ready'
      ? 'A personal stylist for the clothes you already own. You’ll start following each other.'
      : state === 'closed'
        ? 'Ask them for a fresh one when they have more, or join the waitlist.'
        : state === 'invalid'
          ? 'Check it with whoever sent it, or join the waitlist.'
          : undefined

  if (state !== 'ready') {
    return (
      <DoorShell eyebrow={eyebrow} title={title} lead={lead} foot={state === 'checking' ? undefined : <Link to="/landing" className="font-semibold text-brass underline-offset-4 hover:underline">Join the waitlist</Link>}>
        {state === 'checking' ? (
          <div className="flex items-center gap-3 text-sm text-ink/60">
            <Spinner className="h-5 w-5" /> Checking the invite…
          </div>
        ) : undefined}
      </DoorShell>
    )
  }

  if (user) {
    return (
      <DoorShell
        eyebrow={eyebrow}
        title={<>You’re <em className="text-brass">already in.</em></>}
        lead={`This link is for someone new. You can follow ${who} from their room.`}
        foot={
          info?.inviter.handle ? (
            <Link to={`/u/${info.inviter.handle}`} className="font-semibold text-brass underline-offset-4 hover:underline">
              Go to {who}’s room →
            </Link>
          ) : (
            <Link to="/circle" className="font-semibold text-brass underline-offset-4 hover:underline">
              Back to the Circle
            </Link>
          )
        }
      />
    )
  }

  return (
    <DoorShell eyebrow={eyebrow} title={title} lead={lead} foot={<span>Already a member? <SignInLink label="Sign in" /></span>}>
      <form onSubmit={join} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="firstName" className="label">
              First name
            </label>
            <input id="firstName" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="field" autoComplete="given-name" />
          </div>
          <div>
            <label htmlFor="lastName" className="label">
              Last name
            </label>
            <input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} className="field" placeholder="optional" autoComplete="family-name" />
          </div>
        </div>
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="field" autoComplete="email" />
        </div>
        <PasswordField id="password" label="Choose a password" autoComplete="new-password" minLength={8} placeholder="at least 8 characters" value={password} onChange={setPassword} error={error} />
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner className="h-4 w-4" /> : 'Come in'}
        </button>
      </form>
      <Or />
      <GoogleButton onMessage={setError} joinCode={code} redirectTo="/fitting" />
    </DoorShell>
  )

}
