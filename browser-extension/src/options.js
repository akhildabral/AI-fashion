// The options sheet: one field, the ZAUQ origin, kept in chrome.storage.sync.
import { normalizeOrigin, PRODUCTION_ORIGIN } from './zauq-url.js'

const ORIGIN_KEY = 'zauqOrigin'
const form = document.getElementById('form')
const field = document.getElementById('origin')
const hint = document.getElementById('hint')
const reset = document.getElementById('reset')
const restingHint = hint.textContent

function say(text, tone) {
  hint.textContent = text
  hint.className = `hint${tone ? ` is-${tone}` : ''}`
  field.setAttribute('aria-invalid', tone === 'error' ? 'true' : 'false')
}

async function load() {
  try {
    const stored = await chrome.storage.sync.get(ORIGIN_KEY)
    field.value = stored[ORIGIN_KEY] || PRODUCTION_ORIGIN
  } catch {
    field.value = PRODUCTION_ORIGIN
  }
}

async function save(origin) {
  await chrome.storage.sync.set({ [ORIGIN_KEY]: origin })
  field.value = origin
  say(origin === PRODUCTION_ORIGIN ? 'Saved. Pieces go to myzauq.com.' : `Saved. Pieces go to ${origin}.`, 'saved')
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const origin = normalizeOrigin(field.value)
  if (!origin) {
    say('That is not an address I can open. Try https://myzauq.com or http://localhost:5173.', 'error')
    field.focus()
    return
  }
  await save(origin)
})

reset.addEventListener('click', () => void save(PRODUCTION_ORIGIN))
field.addEventListener('input', () => say(restingHint, null))

void load()
