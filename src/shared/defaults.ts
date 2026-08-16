import type {
  InventoryItem,
  LlmSettings,
  NotionSettings,
  PersistedState,
  Reminder,
  Settings
} from './types'
import { MAX_PIPS } from './types'

export const STATE_VERSION = 1

/**
 * The sites Pawse starts out treating as distracting.
 *
 * A starting point, not a verdict — the whole list is editable in Settings,
 * because one person's time sink is another person's lecture hall.
 */
export const defaultBlockedSites: string[] = [
  'youtube.com',
  'reddit.com',
  'x.com',
  'twitter.com',
  'instagram.com',
  'tiktok.com',
  'facebook.com'
]

/**
 * Reduce whatever someone typed to a bare hostname.
 *
 * People paste URLs, type "www.", and add trailing slashes; all three should
 * land on the same entry rather than quietly failing to match anything.
 */
export function normaliseSite(input: string): string {
  let value = input.trim().toLowerCase()
  if (!value) return ''
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  value = value.split('/')[0].split('?')[0].split('#')[0]
  // Strip credentials and any port.
  value = value.split('@').pop() ?? ''
  value = value.split(':')[0]
  value = value.replace(/^www\./, '')
  // A bare word with no dot can't be a hostname, and matching one would be a
  // trap: "study" would swallow every domain containing it.
  if (!value.includes('.')) return ''
  return value.slice(0, 120)
}

/** True when `domain` is the site itself or any subdomain of it. */
export function siteMatches(domain: string, site: string): boolean {
  return domain === site || domain.endsWith(`.${site}`)
}

/** Whether a domain counts as distracting, with study sites winning outright. */
export function isBlockedDomain(
  domain: string,
  blockedSites: string[] | undefined,
  studySites: string[] | undefined
): boolean {
  if (!domain) return false
  const blocked = blockedSites ?? []
  const study = studySites ?? []
  if (study.some((s) => siteMatches(domain, s))) return false
  return blocked.some((s) => siteMatches(domain, s))
}

export const defaultSettings: Settings = {
  launchAtLogin: true,
  startMinimised: false,
  theme: 'night',

  catSize: 'M',
  talkativeness: 0.5,
  showOnAllWorkspaces: true,
  hideDuringFullscreen: true,

  defaultDuration: 45,
  defaultMode: 'deep',
  autoStartBreaks: false,
  idleThresholdMin: 3,
  showHud: true,
  doomscrollSensitivity: 'normal',
  blockedSites: [...defaultBlockedSites],
  studySites: [],

  reminderStyle: 'normal',
  holdNonUrgent: true,
  quietDuringFullscreen: true,
  holdMedication: false,

  muted: false,
  volume: 0.6,

  llm: {
    provider: 'none',
    apiKey: '',
    model: 'gemini-2.0-flash',
    baseUrl: ''
  },
  notion: { token: '' },
  trackingPaused: false,
  bridgeToken: ''
}

/**
 * Read a settings sub-object that may not exist yet.
 *
 * The store back-fills these on load, so main always has them — but the
 * renderer can legitimately be a version ahead during development, when
 * electron-vite hot-reloads the window while the main process keeps running
 * older code. A renderer that dereferences a missing sub-object throws and
 * takes the whole screen down, which turns a harmless version skew into what
 * looks like a broken page.
 */
export function notionSettingsOf(settings: Partial<Settings> | undefined): NotionSettings {
  return { ...defaultSettings.notion, ...settings?.notion }
}

export function llmSettingsOf(settings: Partial<Settings> | undefined): LlmSettings {
  return { ...defaultSettings.llm, ...settings?.llm }
}

/**
 * How often the cat may speak up unprompted, at talkativeness 0 and 1.
 *
 * Shared rather than kept in the nudge engine because Settings has to be able
 * to say what the slider actually means — a bare 0-100 slider called
 * "talkativeness" tells you nothing about how often the cat will interrupt.
 */
export const QUIETEST_NUDGE_MS = 10 * 60_000
export const CHATTIEST_NUDGE_MS = 30_000

/** Minimum gap between unprompted remarks, from the talkativeness slider. */
export function nudgeIntervalMs(talkativeness: number): number {
  const t = Math.min(1, Math.max(0, talkativeness))
  return QUIETEST_NUDGE_MS + (CHATTIEST_NUDGE_MS - QUIETEST_NUDGE_MS) * t
}

/** The same number as a phrase, for the settings row. */
export function describeNudgeInterval(talkativeness: number): string {
  if (talkativeness <= 0) return 'never — the cat only speaks when spoken to'
  const minutes = nudgeIntervalMs(talkativeness) / 60_000
  const rounded = minutes < 1 ? Math.round(minutes * 60) : Math.round(minutes * 2) / 2
  const unit = minutes < 1 ? `${rounded} seconds` : `${rounded} minute${rounded === 1 ? '' : 's'}`
  return `at most one bubble every ${unit}`
}

/**
 * A short, readable pairing code — the kind you can type off a screen without
 * squinting. Ambiguous characters (0/O, 1/I) are left out on purpose.
 */
export function makeBridgeToken(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  const pick = (n: number): string =>
    Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
  return `${pick(3)}-${pick(3)}`
}

export const defaultReminders: Reminder[] = [
  {
    id: 'water',
    kind: 'water',
    builtIn: true,
    label: 'Water',
    everyMinutes: 45,
    windowStart: '09:00',
    windowEnd: '22:00',
    enabled: true,
    urgent: false,
    todayCount: 0
  },
  {
    id: 'stretch',
    kind: 'stretch',
    builtIn: true,
    label: 'Stretch',
    everyMinutes: 90,
    windowStart: '09:00',
    windowEnd: '18:00',
    enabled: true,
    urgent: false,
    todayCount: 0
  },
  {
    id: 'eyes',
    kind: 'eyes',
    builtIn: true,
    label: 'Eye rest',
    everyMinutes: 20,
    onlyDuringFocus: true,
    enabled: true,
    urgent: false,
    todayCount: 0
  },
  {
    id: 'stand',
    kind: 'stand',
    builtIn: true,
    label: 'Stand up',
    everyMinutes: 120,
    enabled: false,
    urgent: false,
    todayCount: 0
  },
  {
    id: 'winddown',
    kind: 'winddown',
    builtIn: true,
    label: 'Wind-down',
    atTime: '22:00',
    enabled: true,
    urgent: false,
    todayCount: 0
  },
  {
    id: 'medication',
    kind: 'medication',
    builtIn: true,
    label: 'Evening dose',
    atTime: '21:00',
    enabled: true,
    urgent: true,
    todayCount: 0
  }
]

export const foodCatalogue: Array<Omit<InventoryItem, 'qty'>> = [
  { id: 'sardine', kind: 'food', name: 'Sardine', icon: 'fish', restores: 3 },
  { id: 'rice-ball', kind: 'food', name: 'Rice ball', icon: 'onigiri', restores: 2 },
  { id: 'milk', kind: 'food', name: 'Milk', icon: 'milk', restores: 2 },
  { id: 'biscuit', kind: 'food', name: 'Biscuit', icon: 'biscuit', restores: 1 },
  { id: 'mackerel', kind: 'food', name: 'Mackerel', icon: 'mackerel', restores: 4 }
]

export function createInitialState(now = Date.now()): PersistedState {
  return {
    version: STATE_VERSION,
    onboarded: false,
    pet: {
      name: 'Moss',
      personality: 'studious',
      health: MAX_PIPS,
      hunger: MAX_PIPS - 2,
      lastDecayAt: now,
      mood: 'idle'
    },
    treats: 0,
    stars: 0,
    inventory: [{ ...foodCatalogue[1], qty: 2 }],
    quests: [],
    reminders: defaultReminders.map((r) => ({ ...r })),
    session: null,
    lastSummary: null,
    questDraft: null,
    bubbles: [],
    log: [],
    siteTime: {},
    settings: {
      ...defaultSettings,
      llm: { ...defaultSettings.llm },
      notion: { ...defaultSettings.notion },
      bridgeToken: makeBridgeToken()
    }
  }
}
