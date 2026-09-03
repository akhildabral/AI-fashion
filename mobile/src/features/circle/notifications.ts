// What happened, as one line each, and where a line lands. Runs of the same
// low-value event on one day collapse: "Sam, Ana and 3 others…".
import type { Href } from 'expo-router'
import type { Notification, PostTarget } from '@zauq/shared/circle'

export function postHref(target: PostTarget | string, id: string): Href {
  return `/(tabs)/circle/post/${target}/${id}` as Href
}

export function userHref(handle: string): Href {
  return `/u/${handle}` as Href
}

const CIRCLE: Href = '/(tabs)/circle'
const CLOSET: Href = '/(tabs)/closet'

/** Where a notification lands: the post it's about when the payload names one. */
function landing(n: Notification, fallback: Href): Href {
  const t = n.payload.target
  const id = n.payload.targetId
  if (typeof t === 'string' && typeof id === 'string') return postHref(t, id)
  if (typeof n.payload.wearLogId === 'string') return postHref('look', n.payload.wearLogId)
  if (typeof n.payload.pickId === 'string') return postHref('pick', n.payload.pickId)
  if (typeof n.payload.pollId === 'string') return postHref('verdict', n.payload.pollId)
  return fallback
}

export function line(n: Notification): { text: string; to: Href } {
  const who = n.actorName ?? n.actorHandle ?? 'Someone'
  const profile: Href = n.actorHandle ? userHref(n.actorHandle) : CIRCLE
  switch (n.type) {
    case 'new_follower':
      return { text: `${who} started following your closet.`, to: profile }
    case 'invite_joined':
      return { text: `${who} came in on your invite. You follow each other now.`, to: profile }
    case 'pick_received':
      return { text: `${who} styled a look for you.`, to: landing(n, CIRCLE) }
    case 'pick_thanked': {
      const preview = String(n.payload.preview ?? '')
      return { text: `${who} said thanks for the look you picked${preview ? `: “${preview}”` : '.'}`, to: landing(n, CIRCLE) }
    }
    case 'pick_worn':
      return { text: `${who} wore the look you picked. Good eye.`, to: landing(n, profile) }
    case 'look_reacted': {
      const kind = String(n.payload.kind ?? '')
      const what = n.payload.target === 'verdict' ? 'your verdict' : n.payload.target === 'pick' ? 'the look you picked' : 'your look'
      const verb = kind === 'bold' ? `called ${what} bold` : kind === 'love' ? `loved ${what}` : `would wear ${what}`
      return { text: `${who} ${verb}.`, to: landing(n, CIRCLE) }
    }
    case 'look_recreated':
      return { text: `${who} recreated your look from their own closet.`, to: profile }
    case 'commented': {
      const preview = String(n.payload.preview ?? '')
      const on = n.payload.target === 'verdict' ? 'your verdict' : n.payload.target === 'pick' ? 'a pick' : 'your look'
      return { text: `${who} left a note on ${on}${preview ? `: “${preview}”` : '.'}`, to: landing(n, CIRCLE) }
    }
    case 'mentioned':
      return { text: `${who} mentioned you in a note.`, to: landing(n, CIRCLE) }
    case 'verdict_asked': {
      const q = String(n.payload.question ?? 'which one')
      return { text: `${who} asked you: “${q}”`, to: landing(n, CIRCLE) }
    }
    case 'verdict_settled': {
      const w = n.payload.winner ? String(n.payload.winner).toUpperCase() : null
      const q = String(n.payload.question ?? 'your verdict')
      const mine = !n.actorHandle
      return {
        text: mine
          ? w
            ? `The verdict is in on “${q}”: ${w} won.`
            : `The verdict’s in on “${q}”: a dead split. Your call.`
          : w
            ? `${who}’s verdict settled: ${w} won.`
            : `${who}’s verdict settled in a split.`,
        to: landing(n, CIRCLE),
      }
    }
    case 'laundry_due': {
      const count = Number(n.payload.count ?? 0)
      return { text: `${count} pieces in the wash, worth a load. The stylist’s working around them.`, to: CLOSET }
    }
    case 'wishlist_nudge': {
      const what = String(n.payload.label ?? 'that piece')
      return { text: `Still thinking about the ${what}? It’s waiting in your wishlist.`, to: CLOSET }
    }
    default:
      return { text: `${who} did something.`, to: CIRCLE }
  }
}

const DIGEST_TYPES = new Set<Notification['type']>(['new_follower', 'look_reacted', 'look_recreated'])

export interface Digest {
  key: string
  type: Notification['type']
  names: string[]
  count: number
  at: string
  read: boolean
  first: Notification
}

/** Collapse runs of the same low-value event on the same day. */
export function digest(items: Notification[]): Digest[] {
  const out: Digest[] = []
  for (const n of items) {
    const day = n.at.slice(0, 10)
    const key = DIGEST_TYPES.has(n.type) ? `${n.type}:${day}` : n.id
    const last = out[out.length - 1]
    const name = n.actorName ?? n.actorHandle
    if (last && last.key === key) {
      last.count += 1
      if (name && !last.names.includes(name)) last.names.push(name)
      last.read = last.read && n.read
      continue
    }
    out.push({ key, type: n.type, names: name ? [name] : [], count: 1, at: n.at, read: n.read, first: n })
  }
  return out
}

export function digestLine(d: Digest): { text: string; to: Href } {
  if (d.count === 1) return line(d.first)
  const shown = d.names.slice(0, 2)
  const rest = d.count - shown.length
  const who = shown.length === 0 ? `${d.count} people` : rest > 0 ? `${shown.join(', ')} and ${rest} other${rest === 1 ? '' : 's'}` : shown.join(' and ')
  switch (d.type) {
    case 'new_follower':
      return { text: `${who} started following your closet.`, to: CIRCLE }
    case 'look_reacted':
      return { text: `${who} reacted to your looks.`, to: CIRCLE }
    case 'look_recreated':
      return { text: `${who} recreated your looks from their own closets.`, to: CIRCLE }
    default:
      return line(d.first)
  }
}
