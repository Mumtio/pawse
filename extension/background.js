/**
 * The only part of the extension that talks to Pawse.
 *
 * Content scripts can't reliably fetch localhost (page CSP gets in the way),
 * so they message the service worker and it makes the request. The worker is
 * allowed to die between messages — every call re-reads the pairing code from
 * storage, so waking up cold costs nothing.
 */

const BRIDGE = 'http://127.0.0.1:17342'

async function getToken() {
  const { pawseToken } = await chrome.storage.local.get('pawseToken')
  return pawseToken || ''
}

async function call(path, options = {}) {
  const token = await getToken()
  if (!token) return { ok: false, error: 'not-paired' }

  try {
    const res = await fetch(`${BRIDGE}${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', 'x-pawse-token': token }
    })
    if (res.status === 401) return { ok: false, error: 'bad-token' }
    if (!res.ok) return { ok: false, error: `http-${res.status}` }
    return await res.json()
  } catch {
    // Pawse simply isn't running. Not an error worth shouting about.
    return { ok: false, error: 'offline' }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'getState') {
    call('/state').then(sendResponse)
    return true
  }

  if (message?.type === 'report') {
    call('/event', {
      method: 'POST',
      body: JSON.stringify(message.payload)
    }).then(sendResponse)
    return true
  }

  if (message?.type === 'test') {
    call('/state').then(sendResponse)
    return true
  }

  return false
})
