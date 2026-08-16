import type { AppState, CatMood, InventoryItem, RewardGrant } from '@shared/types'
import { HEALTH_FLOOR, MAX_PIPS } from '@shared/types'
import { foodCatalogue } from '@shared/defaults'

/**
 * Pet upkeep, tuned so recovery always outruns neglect.
 *
 * Health drains slowly while you are actually at the machine and skipping
 * care, and any single care action puts back more than 45 minutes took away.
 * It floors at HEALTH_FLOOR: the cat gets drowsy, never sick, never gone.
 * Nothing here is allowed to punish a bad day.
 */

const HEALTH_DRAIN_PER_MIN = 1 / 45
const HUNGER_DRAIN_PER_MIN = 1 / 60

/** One care action is worth ~90 minutes of drain. */
const CARE_RESTORE = 2

/** Don't punish a laptop that was shut for a weekend. */
const MAX_CATCHUP_MS = 2 * 60 * 60 * 1000

/** Scrolling a feed during a session you started costs a little more. */
const DISTRACTED_DRAIN_MULTIPLIER = 2.5

export function tickPet(
  state: AppState,
  now: number,
  isIdle: boolean,
  isDistracted = false
): void {
  const last = state.pet.lastDecayAt || now
  const elapsed = Math.min(Math.max(now - last, 0), MAX_CATCHUP_MS)
  state.pet.lastDecayAt = now

  // Time spent away from the keyboard is not neglect.
  if (isIdle || elapsed <= 0) return

  const minutes = elapsed / 60000
  // Only faster during a session — scrolling on your own time is your own
  // business, and the cat has no opinion about it.
  const rate = isDistracted && state.session ? DISTRACTED_DRAIN_MULTIPLIER : 1
  state.pet.health = clampHealth(state.pet.health - minutes * HEALTH_DRAIN_PER_MIN * rate)
  state.pet.hunger = clamp(state.pet.hunger - minutes * HUNGER_DRAIN_PER_MIN, 0, MAX_PIPS)
}

export function clampHealth(value: number): number {
  return clamp(value, HEALTH_FLOOR, MAX_PIPS)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** A confirmed water / stretch / eye-rest / medication action. */
export function rewardCare(state: AppState, mood: CatMood): void {
  state.pet.health = clampHealth(state.pet.health + CARE_RESTORE)
  setTransientMood(state, mood, 6000)
}

/**
 * Leaving a doomscroll costs a little; coming back pays it straight back.
 * Net zero for the person who returns — the point is the return, not the slip.
 */
export function penaliseDoomscroll(state: AppState): void {
  state.pet.health = clampHealth(state.pet.health - 1)
}

export function rewardReturn(state: AppState): void {
  state.pet.health = clampHealth(state.pet.health + 1)
  setTransientMood(state, 'celebrating', 4000)
}

export function feed(state: AppState, itemId: string): boolean {
  const item = state.inventory.find((i) => i.id === itemId && i.qty > 0)
  if (!item) return false
  item.qty -= 1
  state.inventory = state.inventory.filter((i) => i.qty > 0)
  state.pet.hunger = clamp(state.pet.hunger + item.restores, 0, MAX_PIPS)
  // Eat first, then be visibly pleased about it. The pleasure is the point.
  setMoodSequence(state, [
    { mood: 'eating', ms: 2600 },
    { mood: 'celebrating', ms: 3200 }
  ])
  return true
}

export function addItem(state: AppState, item: InventoryItem): void {
  const existing = state.inventory.find((i) => i.id === item.id)
  if (existing) existing.qty += item.qty
  else state.inventory.push({ ...item })
}

/**
 * Food arrives as a gift, not a payout — a weighted roll so it feels earned
 * without turning into a chore you can grind.
 */
export function rollFood(chance = 1): InventoryItem | null {
  if (Math.random() > chance) return null
  const pick = foodCatalogue[Math.floor(Math.random() * foodCatalogue.length)]
  return { ...pick, qty: 1 }
}

export function grantRewards(state: AppState, grant: RewardGrant): void {
  if (grant.treats) state.treats += grant.treats
  if (grant.stars) state.stars += grant.stars
  if (grant.item) addItem(state, grant.item)
}

export function setTransientMood(state: AppState, mood: CatMood, ms: number): void {
  state.pet.mood = mood
  state.pet.moodUntil = Date.now() + ms
  state.pet.moodQueue = undefined
}

/** Play a short run of moods back to back, then fall back to the derived one. */
export function setMoodSequence(
  state: AppState,
  steps: Array<{ mood: CatMood; ms: number }>
): void {
  const [first, ...rest] = steps
  if (!first) return
  state.pet.mood = first.mood
  state.pet.moodUntil = Date.now() + first.ms
  state.pet.moodQueue = rest.length > 0 ? rest : undefined
}

/** Advance the queue when the current mood runs out. Returns true if one was pending. */
export function advanceMoodQueue(state: AppState, now: number): boolean {
  const next = state.pet.moodQueue?.shift()
  if (!next) {
    state.pet.moodQueue = undefined
    return false
  }
  state.pet.mood = next.mood
  state.pet.moodUntil = now + next.ms
  if (state.pet.moodQueue?.length === 0) state.pet.moodQueue = undefined
  return true
}

/**
 * How long on a feed, mid-session, before unimpressed turns into angry.
 *
 * Long enough that looking something up never trips it, short enough that it
 * lands while you're still scrolling rather than as a verdict afterwards.
 */
export const ANGRY_AFTER_MS = 3 * 60_000

/** True once a distraction has run long enough to earn the cross face. */
export function isProperlyAngry(state: AppState, now: number): boolean {
  const since = state.runtime.distractedSince
  return Boolean(state.session && since && now - since > ANGRY_AFTER_MS)
}

/** The mood the cat settles back into once any transient one expires. */
export function deriveMood(state: AppState, isIdle: boolean, isDistracted = false): CatMood {
  const { pet, session } = state
  if (pet.moodUntil && pet.moodUntil > Date.now()) return pet.mood
  if (isIdle) return 'sleeping'
  // Being on a feed mid-session outranks everything else the cat could be
  // showing — it's the one thing it should not look pleased about. Ignore it
  // long enough and unimpressed escalates to properly cross.
  if (session && isDistracted) {
    return isProperlyAngry(state, Date.now()) ? 'angry' : 'distracted'
  }
  if (session && !session.paused) return session.phase === 'break' ? 'break' : 'studying'
  if (pet.health <= HEALTH_FLOOR + 2) return 'drowsy'
  return 'idle'
}

/** 0..MAX_PIPS as whole pips for the segmented bars. */
export function toPips(value: number): number {
  return clamp(Math.ceil(value), 0, MAX_PIPS)
}
