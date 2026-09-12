// The service worker. One job: when the toolbar action is clicked, take the
// active tab's address (activeTab grants it for that click only) and open the
// ZAUQ store page with it. No content scripts, no host permissions, no page
// reading, nothing sent anywhere but the ZAUQ origin the member chose.
import { buildStoreUrl, PRODUCTION_ORIGIN } from './zauq-url.js'

const ORIGIN_KEY = 'zauqOrigin'
const TAB_KEY = 'zauqTabId'

async function chosenOrigin() {
  try {
    const stored = await chrome.storage.sync.get(ORIGIN_KEY)
    return stored[ORIGIN_KEY] || PRODUCTION_ORIGIN
  } catch {
    return PRODUCTION_ORIGIN
  }
}

// The tab we last opened ZAUQ in, if it is still there. Remembering our own
// tab id lets us reuse it without the `tabs` permission (which would let the
// extension read every address, and we do not want that).
async function rememberedTab() {
  try {
    const { [TAB_KEY]: id } = await chrome.storage.session.get(TAB_KEY)
    if (typeof id !== 'number') return null
    return await chrome.tabs.get(id)
  } catch {
    return null
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  const origin = await chosenOrigin()
  const target = buildStoreUrl(origin, tab?.url, 'extension')
  const existing = await rememberedTab()
  if (existing?.id != null) {
    await chrome.tabs.update(existing.id, { url: target, active: true })
    if (existing.windowId != null) await chrome.windows.update(existing.windowId, { focused: true })
    return
  }
  const opened = await chrome.tabs.create({ url: target, index: tab?.index != null ? tab.index + 1 : undefined })
  try {
    await chrome.storage.session.set({ [TAB_KEY]: opened.id })
  } catch {
    // Session storage is a convenience; a fresh tab each time is still correct.
  }
})

chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    const { [TAB_KEY]: id } = await chrome.storage.session.get(TAB_KEY)
    if (id === tabId) await chrome.storage.session.remove(TAB_KEY)
  } catch {
    // ignore
  }
})
