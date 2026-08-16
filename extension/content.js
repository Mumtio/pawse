/**
 * Runs on the handful of sites whose feeds are the usual suspects.
 *
 * What it sends to Pawse: the domain, roughly how long you've been on it, and
 * a note when scrolling has been continuous for a while. Never the URL, never
 * the page content, never anything you type. Everything goes to 127.0.0.1 —
 * nothing leaves the machine.
 *
 * Hiding is done two ways on purpose. Structural things (custom elements,
 * role="feed") are handled by CSS in hide.css. Anything identified by a label
 * or a link target — the Reels and Shorts entries especially — is found here
 * in JS, because those are wrapped in generated class names that change
 * without warning, while their href and aria-label stay put for years.
 */

const POLL_MS = 5000
/** A gap this long means you stopped scrolling and the streak resets. */
const SCROLL_IDLE_MS = 2500
/** These sites re-render constantly; re-apply hiding on a steady beat. */
const REAPPLY_MS = 1200

const domain = location.hostname.replace(/^www\./, '')

let focus = { focusActive: false, hideFeeds: false, scrollThresholdMs: 360000 }
let scrollingSince = 0
let lastScrollAt = 0
let reportedThisStreak = false
let note = null

// ---------------------------------------------------------------------------
// Route detection
// ---------------------------------------------------------------------------

/** Routes that exist to be scrolled forever. */
function isFeedRoute() {
  const p = location.pathname
  if (domain.endsWith('youtube.com')) return p === '/' || p.startsWith('/shorts')
  if (domain.endsWith('reddit.com')) return p === '/' || /^\/r\/(popular|all)\/?$/.test(p)
  if (domain === 'x.com' || domain.endsWith('twitter.com')) return p === '/' || p === '/home'
  if (domain.endsWith('instagram.com')) return p === '/' || p.startsWith('/reels')
  if (domain.endsWith('facebook.com')) return p === '/' || p.startsWith('/reel') || p.startsWith('/watch')
  return p === '/' || p === '/foryou'
}

// ---------------------------------------------------------------------------
// Hiding
// ---------------------------------------------------------------------------

const HIDE_ATTR = 'data-pawse-hidden'

/**
 * Links and buttons that lead straight back into an endless feed. Matching on
 * href and accessible name survives the sites' constant class-name churn.
 */
function shortcutsToFeeds() {
  const found = []

  // Reels / Shorts entries anywhere in the chrome.
  document
    .querySelectorAll('a[href*="/reels"], a[href^="/reel/"], a[href*="/shorts"]')
    .forEach((el) => found.push(el.closest('li, ytd-guide-entry-renderer, [role="listitem"]') ?? el))

  // Same thing, found by accessible name for the ones that aren't links.
  document.querySelectorAll('[aria-label], [title]').forEach((el) => {
    const name = (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().toLowerCase()
    if (name === 'reels' || name === 'shorts' || name === 'reels and short videos') {
      found.push(el.closest('li, [role="listitem"], ytd-guide-entry-renderer') ?? el)
    }
  })

  return found
}

function applyDynamicHiding(active) {
  if (!active) {
    document.querySelectorAll(`[${HIDE_ATTR}]`).forEach((el) => {
      el.removeAttribute(HIDE_ATTR)
      el.style.removeProperty('display')
    })
    return
  }

  for (const el of shortcutsToFeeds()) {
    if (!el || el.hasAttribute(HIDE_ATTR)) continue
    el.setAttribute(HIDE_ATTR, '')
    el.style.setProperty('display', 'none', 'important')
  }
}

function applyFocus() {
  const root = document.documentElement
  const hiding = Boolean(focus.focusActive && focus.hideFeeds)
  const onFeed = isFeedRoute()

  root.classList.toggle('pawse-focus', hiding)
  root.classList.toggle('pawse-home', onFeed)

  applyDynamicHiding(hiding)

  if (hiding && onFeed) showNote()
  else removeNote()
}

/**
 * Leave something friendly behind rather than an unexplained blank page.
 *
 * Fixed rather than injected into the layout: every one of these sites has a
 * different container, several put a fixed header over the top of the
 * document, and a note appended to the wrong element is a note nobody sees.
 */
function showNote() {
  if (note && note.isConnected) return
  note = document.createElement('div')
  note.className = 'pawse-note'
  note.innerHTML =
    '<strong>the feed is having a nap</strong>' +
    'search and anything you opened on purpose still work. ' +
    '<span>this comes back when your focus session ends.</span>'
  document.documentElement.appendChild(note)
}

function removeNote() {
  if (note && note.isConnected) note.remove()
  note = null
}

// ---------------------------------------------------------------------------
// Scroll watching
// ---------------------------------------------------------------------------

window.addEventListener(
  'scroll',
  () => {
    const now = Date.now()
    if (now - lastScrollAt > SCROLL_IDLE_MS) {
      // Long enough gap that this is a new stretch of scrolling.
      scrollingSince = now
      reportedThisStreak = false
    }
    lastScrollAt = now

    if (reportedThisStreak || !scrollingSince) return
    if (now - scrollingSince < focus.scrollThresholdMs) return

    reportedThisStreak = true
    send({ type: 'scroll', domain, scrollingMs: now - scrollingSince })
  },
  { passive: true, capture: true }
)

// ---------------------------------------------------------------------------
// Talking to Pawse
// ---------------------------------------------------------------------------

function send(payload) {
  try {
    chrome.runtime.sendMessage({ type: 'report', payload }, (res) => {
      void chrome.runtime.lastError
      if (res && res.ok) focus = res
    })
  } catch {
    // Extension was reloaded out from under us; the next poll re-establishes.
  }
}

function poll() {
  if (document.hidden) return
  try {
    chrome.runtime.sendMessage({ type: 'getState' }, (res) => {
      void chrome.runtime.lastError
      if (res && res.ok) {
        focus = res
        applyFocus()
      } else if (res && res.error === 'offline') {
        // Pawse closed — put everything back exactly as we found it.
        focus = { focusActive: false, hideFeeds: false, scrollThresholdMs: 360000 }
        applyFocus()
      }
    })
    // Reporting the domain is what lets the cat tell working from scrolling.
    send({ type: 'activity', domain, seconds: POLL_MS / 1000 })
  } catch {
    /* ignore */
  }
}

poll()
setInterval(poll, POLL_MS)

// These are single-page apps: the route changes and whole feeds re-render
// without a reload, so re-apply on a beat rather than trusting one pass.
let lastPath = location.pathname
setInterval(() => {
  if (location.pathname !== lastPath) lastPath = location.pathname
  applyFocus()
}, REAPPLY_MS)
