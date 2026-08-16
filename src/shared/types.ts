/**
 * The single source of truth shared by the main process and both renderers.
 *
 * Main owns all state and broadcasts the whole AppState whenever it changes.
 * Renderers never mutate; they send Intents and re-render from what comes back.
 */

export const MAX_PIPS = 10

/** Health never drops below this. The cat gets sleepy, never sick. */
export const HEALTH_FLOOR = 3

export type CatMood =
  | 'idle'
  | 'studying'
  | 'break'
  | 'sleeping'
  | 'stretching'
  | 'drinking'
  | 'eating'
  | 'celebrating'
  | 'curious'
  | 'drowsy'
  /** Set by the cat window while it's being dragged; never derived in main. */
  | 'held'
  /** Session running, but you're on a feed. The one unhappy face the cat has. */
  | 'distracted'

export type Personality = 'calm' | 'playful' | 'sleepy' | 'encouraging' | 'studious'

export type FocusMode = 'gentle' | 'deep' | 'strict'

export type ReminderKind =
  | 'water'
  | 'stretch'
  | 'eyes'
  | 'stand'
  | 'winddown'
  | 'medication'
  | 'custom'

// ---------------------------------------------------------------------------
// Pet
// ---------------------------------------------------------------------------

export interface PetState {
  name: string
  personality: Personality
  /** 0..MAX_PIPS, floored at HEALTH_FLOOR — see decay() in pet.ts */
  health: number
  hunger: number
  /** Epoch ms of the last decay tick, so we can catch up after sleep/quit. */
  lastDecayAt: number
  mood: CatMood
  /** Transient mood set by an action; reverts to the derived mood when it expires. */
  moodUntil?: number
  /** Moods to play once the current one runs out — e.g. eating, then pleased. */
  moodQueue?: Array<{ mood: CatMood; ms: number }>
}

export interface InventoryItem {
  id: string
  kind: 'food' | 'trinket'
  name: string
  /** Sprite key; falls back to a glyph until art lands. */
  icon: string
  qty: number
  /** How many hunger pips one unit restores. */
  restores: number
}

// ---------------------------------------------------------------------------
// Focus
// ---------------------------------------------------------------------------

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

export type FocusPhase = 'focus' | 'break' | 'done'

export interface FocusSession {
  id: string
  taskTitle: string
  questId?: string
  chapterId?: string
  plannedMinutes: number
  breakMinutes: number
  mode: FocusMode
  phase: FocusPhase
  /** Epoch ms when the current phase's running stretch began. */
  phaseStartedAt: number
  /** Ms banked in the current phase before the most recent pause. */
  phaseAccumulatedMs: number
  paused: boolean
  startedAt: number
  endedAt?: number
  // Tallies for the end-of-session summary
  activeMs: number
  idleMs: number
  distractedMs: number
  interruptions: number
  returns: number
  checklist: ChecklistItem[]
}

export interface SessionSummary {
  taskTitle: string
  activeMinutes: number
  idleMinutes: number
  distractedMinutes: number
  checklistDone: number
  checklistTotal: number
  returns: number
  rewards: RewardGrant[]
}

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

export interface Chapter {
  id: string
  title: string
  /** The real, un-gamified task this chapter stands for. */
  realTask: string
  estMinutes: number
  reward: string
  done: boolean
  doneAt?: number
}

export type QuestSource = 'manual' | 'paste' | 'file' | 'llm'

export interface Quest {
  id: string
  title: string
  subtitle: string
  theme: string
  source: QuestSource
  dueAt?: number
  createdAt: number
  chapters: Chapter[]
  archivedAt?: number
}

export interface RewardGrant {
  label: string
  treats?: number
  stars?: number
  item?: InventoryItem
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export interface Reminder {
  id: string
  kind: ReminderKind
  label: string
  /** What the cat actually says. Falls back to wording for the kind. */
  message?: string
  /** Built-in reminders can be turned off but not deleted. */
  builtIn?: boolean
  /** Interval reminders: fire every N minutes. */
  everyMinutes?: number
  /** Clock reminders: fire at "HH:MM" local. */
  atTime?: string
  /** Optional active window, "HH:MM". */
  windowStart?: string
  windowEnd?: string
  onlyDuringFocus?: boolean
  enabled: boolean
  /** Urgent reminders are never held back or batched (medication). */
  urgent: boolean
  lastFiredAt?: number
  lastConfirmedAt?: number
  /** Set by "later" — suppressed until this epoch ms. */
  snoozedUntil?: number
  /** Confirmations today, reset at local midnight. */
  todayCount: number
}

// ---------------------------------------------------------------------------
// Cat speech bubbles
// ---------------------------------------------------------------------------

export interface BubbleAction {
  id: string
  label: string
  intent: Intent
}

export interface Bubble {
  id: string
  kind: 'reminder' | 'focus' | 'doomscroll' | 'system' | 'nudge'
  text: string
  actions: BubbleAction[]
  createdAt: number
  /** Auto-dismiss at this epoch ms; omitted means it waits for an answer. */
  expiresAt?: number
  reminderId?: string
}

// ---------------------------------------------------------------------------
// Activity log (feeds Insights; domains only, never page content)
// ---------------------------------------------------------------------------

export type LogType =
  | 'focus_started'
  | 'focus_completed'
  | 'focus_abandoned'
  | 'chapter_done'
  | 'reminder_fired'
  | 'reminder_confirmed'
  | 'reminder_snoozed'
  | 'fed'
  | 'petted'
  | 'returned_from_distraction'
  | 'doomscroll_prompted'

export interface LogEntry {
  at: number
  type: LogType
  minutes?: number
  meta?: Record<string, string | number | boolean>
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type LlmProvider = 'none' | 'gemini' | 'openai-compatible' | 'ollama'

export interface LlmSettings {
  provider: LlmProvider
  apiKey: string
  model: string
  /** For openai-compatible / ollama. */
  baseUrl: string
}

export interface Settings {
  launchAtLogin: boolean
  startMinimised: boolean
  theme: 'night' | 'day' | 'system'

  catSize: 'S' | 'M' | 'L'
  talkativeness: number // 0..1
  showOnAllWorkspaces: boolean
  hideDuringFullscreen: boolean
  /** Where the user last dragged the cat to. */
  catPosition?: { x: number; y: number }

  defaultDuration: number
  defaultMode: FocusMode
  autoStartBreaks: boolean
  idleThresholdMin: number
  showHud: boolean
  doomscrollSensitivity: 'relaxed' | 'normal' | 'watchful'

  reminderStyle: 'gentle' | 'normal' | 'persistent'
  holdNonUrgent: boolean
  quietDuringFullscreen: boolean
  holdMedication: boolean

  muted: boolean
  /** 0..1 */
  volume: number

  llm: LlmSettings
  trackingPaused: boolean
  /** Pairing code for the browser extension. Generated on first run. */
  bridgeToken: string
}

/** One-shot audio cues, synthesised in the renderer — no audio files. */
export type SoundCue =
  | 'blip'
  | 'bubble'
  | 'confirm'
  | 'eat'
  | 'purr'
  | 'complete'
  | 'start'
  | 'break'

// ---------------------------------------------------------------------------
// The whole state
// ---------------------------------------------------------------------------

export interface AppState {
  version: number
  onboarded: boolean
  pet: PetState
  treats: number
  stars: number
  inventory: InventoryItem[]
  quests: Quest[]
  reminders: Reminder[]
  session: FocusSession | null
  lastSummary: SessionSummary | null
  /** A generated quest awaiting the user's approval. Never saved unasked. */
  questDraft: Quest | null
  bubbles: Bubble[]
  log: LogEntry[]
  settings: Settings
  /** Not persisted — recomputed each boot. */
  runtime: RuntimeState
}

export interface RuntimeState {
  now: number
  idleSeconds: number
  catVisible: boolean
  mainVisible: boolean
  /** Seconds left in the current phase, already computed for the UI. */
  phaseRemainingSec: number
  extensionConnected: boolean
  /** True while a quest generation request is in flight. */
  llmBusy: boolean
  /** Set by "still good" — no scroll check-ins until this epoch ms. */
  doomscrollSnoozeUntil?: number
  /** When the cat last spoke up of its own accord. */
  lastNudgeAt?: number
  /** Domain of the active tab, as last reported by the extension. */
  currentDomain?: string
  /** Epoch ms of the last report, so a stale domain can be forgotten. */
  domainSeenAt?: number
  /** Set while the active tab is a feed; cleared the moment it isn't. */
  distractedSince?: number
  /** Epoch ms the current stretch at the keyboard began, for "shall we start?". */
  activeSince?: number
  /** Set when the last generation fell back to the offline splitter. */
  llmNotice?: string
}

/** What gets written to disk — runtime is dropped. */
export type PersistedState = Omit<AppState, 'runtime'>

// ---------------------------------------------------------------------------
// Insights (computed in main from the log, so renderers never hold raw history)
// ---------------------------------------------------------------------------

export type DaySlotState = 'focused' | 'distracted' | 'away'

export interface Insights {
  todayFocusMinutes: number
  todayDistractedMinutes: number
  sessionsToday: number
  chaptersToday: number
  returns: number
  /** Today in half-hour slots, 09:00 → 21:00, for the "Your day" strip. */
  dayStrip: Array<{ at: number; state: DaySlotState }>
  /** Focused minutes per hour of day across the last 7 days. */
  hourHistogram: number[]
  care: Array<{ kind: ReminderKind; label: string; done: number; of: number }>
  topDomains: Array<{ domain: string; minutes: number }>
  /** Plain-language readouts the cat says out loud. Observations, not verdicts. */
  observations: string[]
  /** Only set once there's genuinely enough data to say something. */
  suggestion?: { text: string; defaultMinutes: number }
}

/**
 * What renderers actually receive. The raw activity log stays in main — the UI
 * only ever needs the summary, and not shipping history to a window every
 * second keeps the payload small.
 */
export type ClientState = Omit<AppState, 'log'> & { insights: Insights }

// ---------------------------------------------------------------------------
// Intents (renderer -> main)
// ---------------------------------------------------------------------------

export type Intent =
  | { type: 'onboard:complete'; name: string; personality: Personality }
  | { type: 'focus:start'; taskTitle: string; minutes: number; breakMinutes: number; mode: FocusMode; questId?: string; chapterId?: string; checklist: string[] }
  | { type: 'focus:pause' }
  | { type: 'focus:resume' }
  | { type: 'focus:stop' }
  | { type: 'focus:skipPhase' }
  | { type: 'focus:toggleChecklist'; itemId: string }
  | { type: 'focus:dismissSummary' }
  | { type: 'quest:create'; title: string; subtitle: string; chapters: Array<Pick<Chapter, 'title' | 'realTask' | 'estMinutes' | 'reward'>> }
  | { type: 'quest:generate'; text: string; theme: string }
  | { type: 'quest:acceptDraft' }
  | { type: 'quest:discardDraft' }
  | { type: 'quest:toggleChapter'; questId: string; chapterId: string }
  | { type: 'quest:archive'; questId: string }
  | { type: 'pet:feed'; itemId: string }
  | { type: 'pet:pet' }
  | { type: 'pet:rename'; name: string }
  | { type: 'reminder:confirm'; reminderId: string }
  | { type: 'reminder:snooze'; reminderId: string; minutes: number }
  | { type: 'reminder:toggle'; reminderId: string; enabled: boolean }
  | { type: 'reminder:update'; reminder: Reminder }
  | { type: 'reminder:add'; reminder: Reminder }
  | { type: 'reminder:remove'; reminderId: string }
  | { type: 'bubble:dismiss'; bubbleId: string }
  | { type: 'doomscroll:continue'; minutes: number }
  | { type: 'doomscroll:return' }
  | { type: 'bridge:regenerateToken' }
  | { type: 'settings:patch'; patch: Partial<Settings> }
  | { type: 'window:showMain' }
  | { type: 'window:hideMain' }
  | { type: 'cat:setVisible'; visible: boolean }
  | { type: 'data:export' }
  | { type: 'data:openFolder' }
  | { type: 'data:deleteHistory' }
  | { type: 'data:deleteEverything' }

/** Anything main wants to hand back to a specific invoke. */
export interface IntentResult {
  ok: boolean
  error?: string
  data?: unknown
}
