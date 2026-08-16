import type { InventoryItem, PersistedState, Reminder, Settings } from './types'
import { MAX_PIPS } from './types'

export const STATE_VERSION = 1

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
  trackingPaused: false,
  bridgeToken: ''
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
    settings: {
      ...defaultSettings,
      llm: { ...defaultSettings.llm },
      bridgeToken: makeBridgeToken()
    }
  }
}
