/**
 * Runs on every site, acts on almost none of them.
 *
 * It has to load everywhere because the blocked list is yours to edit and a
 * manifest can't be rewritten at runtime — but which sites it actually does
 * anything on is decided by Pawse, from the lists in Settings, and re-read on
 * every poll.
 *
 * What it sends to Pawse: for a site on one of your lists, the domain, roughly
 * how long you've been on it, and a note when scrolling has been continuous
 * for a while. For every other site — the overwhelming majority — it sends
 * only the fact that you're on something unlisted, with no domain attached.
 * That's enough for the cat to know you've left the feed and not one byte
 * more. Never the URL, never the page content, never anything you type.
 * Everything goes to 127.0.0.1 — nothing leaves the machine.
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
/** While scrolling a blocked site, ping more often than the idle poll. */
const SCROLL_ACTIVITY_MS = 1000
/** These sites re-render constantly; re-apply hiding on a steady beat. */
const REAPPLY_MS = 1200

const domain = location.hostname.replace(/^www\./, '')

let focus = {
  focusActive: false,
  hideFeeds: false,
  scrollThresholdMs: 360000,
  blockedSites: [],
  studySites: []
}

/** False until Pawse has answered once. Unknown lists are not "unlisted". */
let heardFromPawse = false

// ---------------------------------------------------------------------------
// Which list this page is on
// ---------------------------------------------------------------------------

function matches(site) {
  return domain === site || domain.endsWith(`.${site}`)
}

/** A study site is never touched and never reported as a distraction. */
function isStudy() {
  return (focus.studySites || []).some(matches)
}

/** Blocked, unless it's also been named as a study site — study wins. */
function isBlocked() {
  if (isStudy()) return false
  return (focus.blockedSites || []).some(matches)
}

/** On one of the lists at all, and therefore a domain Pawse may be told about. */
function isListed() {
  return isBlocked() || isStudy()
}

let scrollingSince = 0
let lastScrollAt = 0
let lastActivityPing = 0
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
  // Anything you added yourself: treat the front page as the feed and leave
  // deeper pages alone, so a site you blocked is still usable for the one
  // thing you went there to look up.
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
  // Nothing is ever hidden on a site you haven't blocked, session or not.
  const hiding = Boolean(focus.focusActive && focus.hideFeeds && isBlocked())
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

/**
 * YouTube Shorts, Instagram Reels, TikTok, X, and Reddit mostly scroll an
 * inner div — `window` 'scroll' never fires. Wheel and touchmove do.
 */
function onScrollLike() {
  const now = Date.now()
  if (now - lastScrollAt > SCROLL_IDLE_MS) {
    scrollingSince = now
    reportedThisStreak = false
  }
  lastScrollAt = now

  // Tell the cat immediately, not on the next 5s poll. Being on the domain
  // is what turns it unimpressed; this just means we notice the scroll itself.
  if (heardFromPawse && isBlocked() && now - lastActivityPing >= SCROLL_ACTIVITY_MS) {
    lastActivityPing = now
    send({ type: 'activity', domain, seconds: SCROLL_ACTIVITY_MS / 1000 })
  }

  if (reportedThisStreak || !scrollingSince) return
  if (now - scrollingSince < focus.scrollThresholdMs) return
  if (!isBlocked()) return

  reportedThisStreak = true
  send({ type: 'scroll', domain, scrollingMs: now - scrollingSince })
}

for (const type of ['scroll', 'wheel', 'touchmove']) {
  window.addEventListener(type, onScrollLike, { passive: true, capture: true })
}

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

function reportPresence() {
  if (!heardFromPawse) return
  if (isListed()) send({ type: 'activity', domain, seconds: POLL_MS / 1000 })
  else send({ type: 'activity', unlisted: true, seconds: POLL_MS / 1000 })
}

function poll() {
  if (document.hidden || document.prerendering) return
  try {
    chrome.runtime.sendMessage({ type: 'getState' }, (res) => {
      void chrome.runtime.lastError
      if (res && res.ok) {
        focus = res
        heardFromPawse = true
        applyFocus()
        reportPresence()
      } else if (res && (res.error === 'offline' || res.error === 'not-paired' || res.error === 'bad-token')) {
        // Pawse closed or the pairing code is wrong — put the page back and
        // stop claiming we know the lists.
        heardFromPawse = false
        focus = {
          focusActive: false,
          hideFeeds: false,
          scrollThresholdMs: 360000,
          blockedSites: [],
          studySites: []
        }
        applyFocus()
      }
    })
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
