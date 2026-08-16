import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import type { AppState } from '@shared/types'
import { getState, publish } from './appState'
import { penaliseDoomscroll } from './pet'
import { pushLog } from './log'

/**
 * The bridge the browser extension talks to.
 *
 * Deliberately plain HTTP on the loopback interface rather than a WebSocket:
 * MV3 service workers are killed after a few seconds of inactivity, so a
 * long-lived socket would spend most of its life dead. Short polls survive
 * that lifecycle, and they need no dependency.
 *
 * Requests must carry the pairing token shown in Settings, so a random page
 * cannot read your focus state just because it can reach localhost.
 */

const PORT = 17342
const HOST = '127.0.0.1'
/** No contact for this long and we consider the extension gone. */
const LIVENESS_MS = 20_000

/** Sites whose feeds are the usual suspects; used only to label time. */
const DISTRACTING = [
  'youtube.com',
  'reddit.com',
  'x.com',
  'twitter.com',
  'instagram.com',
  'tiktok.com',
  'facebook.com'
]

const SCROLL_THRESHOLD_MS: Record<string, number> = {
  relaxed: 8 * 60_000,
  normal: 6 * 60_000,
  watchful: 4 * 60_000
}

let server: Server | null = null
let lastSeen = 0

export function startBridge(): void {
  if (server) return
  server = createServer(handle)
  server.on('error', (err) => {
    // A busy port is not fatal — the app simply runs without the Gatekeeper.
    console.error('[bridge] could not listen:', err.message)
    server = null
  })
  server.listen(PORT, HOST, () => {
    console.log(`[bridge] listening on http://${HOST}:${PORT}`)
  })
}

export function stopBridge(): void {
  server?.close()
  server = null
}

export function isExtensionConnected(): boolean {
  return Date.now() - lastSeen < LIVENESS_MS
}

function handle(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`)

  // Only the extension needs to reach this, and only from the local machine.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-pawse-token')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end()
    return
  }

  const state = getState()
  const token = req.headers['x-pawse-token'] ?? url.searchParams.get('token')
  if (!token || token !== state.settings.bridgeToken) {
    res.writeHead(401, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'bad or missing pairing code' }))
    return
  }

  lastSeen = Date.now()

  if (url.pathname === '/state' && req.method === 'GET') {
    sendJson(res, focusPayload(state))
    return
  }

  if (url.pathname === '/event' && req.method === 'POST') {
    readBody(req)
      .then((body) => {
        applyEvent(state, body)
        publish()
        sendJson(res, focusPayload(getState()))
      })
      .catch(() => {
        res.writeHead(400).end()
      })
    return
  }

  res.writeHead(404).end()
}

function focusPayload(state: AppState): Record<string, unknown> {
  const session = state.session
  const active = Boolean(session) && !state.settings.trackingPaused
  return {
    ok: true,
    focusActive: active,
    mode: session?.mode ?? null,
    // Gentle mode asks first, so it never hides anything on its own.
    hideFeeds: active && session?.mode !== 'gentle',
    blockSites: active && session?.mode === 'strict',
    sensitivity: state.settings.doomscrollSensitivity,
    scrollThresholdMs: SCROLL_THRESHOLD_MS[state.settings.doomscrollSensitivity] ?? 360_000,
    catName: state.pet.name
  }
}

interface BridgeEvent {
  type?: string
  domain?: string
  seconds?: number
  scrollingMs?: number
}

function applyEvent(state: AppState, body: BridgeEvent): void {
  if (state.settings.trackingPaused) return
  const domain = normaliseDomain(body.domain ?? '')
  if (!domain) return

  if (body.type === 'activity') {
    const seconds = Math.min(Math.max(body.seconds ?? 0, 0), 120)
    const now = Date.now()
    const distracting = isDistracting(domain)

    // Remember where you are, so the rest of the app can react. Without this
    // the cat cheerfully encourages you while you scroll a feed, because it
    // only knows a session is running, not what you're actually doing.
    state.runtime.currentDomain = domain
    state.runtime.domainSeenAt = now
    if (distracting) {
      state.runtime.distractedSince ??= now
    } else {
      state.runtime.distractedSince = undefined
    }

    if (state.session && distracting) {
      state.session.distractedMs += seconds * 1000
    }
    return
  }

  if (body.type === 'scroll') {
    maybeAskAboutScrolling(state, domain)
  }
}

/**
 * The intervention, and the most delicate thing in the app.
 *
 * It asks rather than blocks, it offers "keep going" as a first-class answer,
 * and it only appears once per episode. Nothing about it should read as being
 * caught doing something wrong.
 */
function maybeAskAboutScrolling(state: AppState, domain: string): void {
  const already = state.bubbles.some((b) => b.kind === 'doomscroll')
  if (already) return

  const now = Date.now()
  // "still good" means we take them at their word and stay out of the way.
  if (state.runtime.doomscrollSnoozeUntil && now < state.runtime.doomscrollSnoozeUntil) return
  pushLog(state, { at: now, type: 'doomscroll_prompted', meta: { domain } })
  penaliseDoomscroll(state)

  state.bubbles.push({
    id: randomUUID(),
    kind: 'doomscroll',
    text: 'still enjoying this, or did we get stuck scrolling?',
    createdAt: now,
    actions: [
      {
        id: 'continue',
        label: 'still good',
        intent: { type: 'doomscroll:continue', minutes: 5 }
      },
      { id: 'return', label: 'back to work', intent: { type: 'doomscroll:return' } }
    ]
  })
}

function normaliseDomain(input: string): string {
  return input.replace(/^www\./, '').toLowerCase().slice(0, 120)
}

function isDistracting(domain: string): boolean {
  return DISTRACTING.some((d) => domain === d || domain.endsWith(`.${d}`))
}

function sendJson(res: ServerResponse, payload: unknown): void {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify(payload))
}

async function readBody(req: IncomingMessage): Promise<BridgeEvent> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 8192) throw new Error('body too large')
    chunks.push(chunk as Buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as BridgeEvent
}
