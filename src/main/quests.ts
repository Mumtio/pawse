import { randomUUID } from 'node:crypto'
import type { AppState, Chapter, Quest, RewardGrant } from '@shared/types'
import { grantRewards, rollFood, setTransientMood } from './pet'
import { pushLog } from './log'

export type ChapterSeed = Pick<Chapter, 'title' | 'realTask' | 'estMinutes' | 'reward'>

export function makeQuest(
  title: string,
  subtitle: string,
  chapters: ChapterSeed[],
  source: Quest['source'] = 'manual',
  theme = 'fantasy kingdom'
): Quest {
  return {
    id: randomUUID(),
    title: title.trim() || 'Untitled quest',
    subtitle: subtitle.trim(),
    theme,
    source,
    createdAt: Date.now(),
    chapters: chapters.map((c) => ({
      id: randomUUID(),
      title: c.title,
      realTask: c.realTask,
      estMinutes: c.estMinutes,
      reward: c.reward,
      done: false
    }))
  }
}

export function addQuest(state: AppState, quest: Quest): void {
  state.quests.unshift(quest)
}

export interface DraftEdits {
  title: string
  subtitle: string
  chapters: Array<Pick<Chapter, 'id' | 'title' | 'realTask' | 'estMinutes' | 'reward'>>
}

/**
 * Fold the approval screen's edits into the generated draft.
 *
 * Only the fields a person can actually change are taken from the edit. Id,
 * theme, source, createdAt and dueAt come from the draft — provenance is not
 * the user's to retype, and a quest that came from Notion should still say so
 * after its wording has been tidied up. Chapter order follows the edit, since
 * reordering is one of the things being approved.
 */
export function applyDraftEdits(draft: Quest, edits: DraftEdits): Quest {
  const byId = new Map(draft.chapters.map((c) => [c.id, c]))
  return {
    ...draft,
    title: edits.title.trim() || draft.title,
    subtitle: edits.subtitle.trim(),
    chapters: edits.chapters
      // An edit naming a chapter that isn't in the draft is not to be trusted.
      .filter((c) => byId.has(c.id))
      .map((c) => {
        const original = byId.get(c.id)!
        return {
          ...original,
          // Blanking a field means "leave it alone", never "save it empty".
          title: c.title.trim() || original.title,
          realTask: c.realTask.trim() || original.realTask,
          estMinutes: Math.min(600, Math.max(5, Math.round(c.estMinutes) || original.estMinutes)),
          reward: c.reward.trim() || original.reward
        }
      })
  }
}

export function archiveQuest(state: AppState, questId: string): void {
  const q = state.quests.find((x) => x.id === questId)
  if (q) q.archivedAt = Date.now()
}

/**
 * Ticking a chapter is the moment real work turns into something for the cat.
 * Unticking is allowed and silently takes nothing back — undo shouldn't feel
 * like a punishment for miscounting.
 */
export function toggleChapter(state: AppState, questId: string, chapterId: string): void {
  const quest = state.quests.find((q) => q.id === questId)
  const chapter = quest?.chapters.find((c) => c.id === chapterId)
  if (!quest || !chapter) return

  chapter.done = !chapter.done

  if (!chapter.done) {
    chapter.doneAt = undefined
    return
  }

  const now = Date.now()
  chapter.doneAt = now

  const rewards: RewardGrant[] = [{ label: chapter.reward, treats: 2 }]
  const food = rollFood(0.6)
  if (food) rewards.push({ label: `${food.name} appeared`, item: food })

  const finished = quest.chapters.every((c) => c.done)
  if (finished) rewards.push({ label: `${quest.title} complete`, stars: 1 })

  rewards.forEach((r) => grantRewards(state, r))
  setTransientMood(state, 'celebrating', 6000)
  pushLog(state, {
    at: now,
    type: 'chapter_done',
    minutes: chapter.estMinutes,
    meta: { quest: quest.title, chapter: chapter.title }
  })
}

export function activeQuests(state: AppState): Quest[] {
  return state.quests.filter((q) => !q.archivedAt && q.chapters.some((c) => !c.done))
}

/** The next unfinished chapters across every active quest, soonest due first. */
export function nextUp(state: AppState, limit = 3): Array<{ quest: Quest; chapter: Chapter }> {
  const rows: Array<{ quest: Quest; chapter: Chapter }> = []
  for (const quest of activeQuests(state)) {
    const chapter = quest.chapters.find((c) => !c.done)
    if (chapter) rows.push({ quest, chapter })
  }
  rows.sort((a, b) => (a.quest.dueAt ?? Infinity) - (b.quest.dueAt ?? Infinity))
  return rows.slice(0, limit)
}
