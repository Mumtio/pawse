import { app, dialog, ipcMain, shell } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Intent, IntentResult } from '@shared/types'
import { createInitialState, makeBridgeToken } from '@shared/defaults'
import { getState, mutate, publish, replaceState, toClientState } from './appState'
import {
  finishSession,
  pauseSession,
  resumeSession,
  skipPhase,
  startSession,
  toggleChecklistItem
} from './focus'
import { clearNudges, confirmReminder, snoozeReminder } from './reminders'
import { addQuest, makeQuest, toggleChapter, archiveQuest } from './quests'
import { playSound } from './sound'
import { feed, rewardReturn, setTransientMood } from './pet'
import { generateQuest } from './llm'
import { pushLog } from './log'
import { getDataDir } from './store'
import {
  applyCatSettings,
  beginCatDrag,
  finishCatDrag,
  hideMain,
  setCatInteractive,
  setCatVisible,
  showMain
} from './windows'

/**
 * One channel in, one broadcast out. Renderers describe what the person did
 * ("confirm the water reminder"), never how state should change.
 */

export function registerIpc(onTrayNeedsUpdate: () => void): void {
  ipcMain.handle('pawse:requestState', () => toClientState(getState()))

  ipcMain.handle('pawse:intent', async (_e, intent: Intent): Promise<IntentResult> => {
    try {
      const result = await handleIntent(intent, onTrayNeedsUpdate)
      return result ?? { ok: true }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      console.error('[ipc] intent failed:', intent.type, error)
      return { ok: false, error }
    }
  })

  // The cat window is click-through by default; the renderer flips this on
  // when the pointer is actually over the sprite or an open bubble.
  ipcMain.on('cat:setInteractive', (_e, interactive: boolean) => setCatInteractive(interactive))

  /**
   * The renderer only reports where inside the sprite the grab started and
   * when the button came back up. Main owns the movement itself — see
   * beginCatDrag in windows.ts for why.
   */
  ipcMain.on('cat:dragStart', () => {
    beginCatDrag()
  })

  ipcMain.handle('cat:dragEnd', () => {
    const { moved, position } = finishCatDrag()
    mutate((s) => {
      s.settings.catPosition = position
    })
    return { moved }
  })
}

async function handleIntent(
  intent: Intent,
  onTrayNeedsUpdate: () => void
): Promise<IntentResult | void> {
  const state = getState()

  switch (intent.type) {
    case 'onboard:complete':
      mutate((s) => {
        s.pet.name = intent.name.trim() || 'Moss'
        s.pet.personality = intent.personality
        s.onboarded = true
      })
      onTrayNeedsUpdate()
      return

    // -- focus ------------------------------------------------------------
    case 'focus:start':
      mutate((s) => {
        clearNudges(s)
        return startSession(s, {
          taskTitle: intent.taskTitle,
          minutes: intent.minutes,
          breakMinutes: intent.breakMinutes,
          mode: intent.mode,
          questId: intent.questId,
          chapterId: intent.chapterId,
          checklist: intent.checklist
        })
      })
      // Starting focus gets the dashboard out of the way; the cat carries the
      // session from here.
      hideMain()
      playSound('start')
      publish()
      return

    case 'focus:pause':
      mutate((s) => pauseSession(s))
      return

    case 'focus:resume':
      mutate((s) => resumeSession(s))
      return

    case 'focus:stop':
      mutate((s) => {
        clearNudges(s)
        finishSession(s, Date.now(), true)
      })
      showMain()
      return

    case 'focus:skipPhase':
      mutate((s) => skipPhase(s))
      return

    case 'focus:toggleChecklist':
      mutate((s) => toggleChecklistItem(s, intent.itemId))
      return

    case 'focus:dismissSummary':
      mutate((s) => {
        s.lastSummary = null
      })
      return

    // -- quests -----------------------------------------------------------
    case 'quest:create':
      mutate((s) => addQuest(s, makeQuest(intent.title, intent.subtitle, intent.chapters)))
      return

    case 'quest:generate': {
      mutate((s) => {
        s.runtime.llmBusy = true
        s.runtime.llmNotice = undefined
      })
      try {
        const { quest, notice } = await generateQuest(
          intent.text,
          intent.theme,
          state.settings.llm
        )
        mutate((s) => {
          s.questDraft = quest
          s.runtime.llmBusy = false
          s.runtime.llmNotice = notice
        })
        return { ok: true, data: { notice } }
      } catch (err) {
        mutate((s) => {
          s.runtime.llmBusy = false
        })
        throw err
      }
    }

    // Nothing generated is ever saved without the user seeing it first.
    case 'quest:acceptDraft':
      mutate((s) => {
        if (!s.questDraft) return
        addQuest(s, s.questDraft)
        s.questDraft = null
        s.runtime.llmNotice = undefined
      })
      return

    case 'quest:discardDraft':
      mutate((s) => {
        s.questDraft = null
        s.runtime.llmNotice = undefined
      })
      return

    case 'quest:toggleChapter': {
      const wasDone = findChapter(state, intent.questId, intent.chapterId)?.done
      mutate((s) => toggleChapter(s, intent.questId, intent.chapterId))
      // Only celebrate ticking a chapter off, never unticking one.
      if (!wasDone) playSound('complete')
      return
    }

    case 'quest:archive':
      mutate((s) => archiveQuest(s, intent.questId))
      return

    // -- pet --------------------------------------------------------------
    case 'pet:feed':
      mutate((s) => {
        if (feed(s, intent.itemId)) {
          pushLog(s, { at: Date.now(), type: 'fed' })
          playSound('eat')
        }
      })
      return

    case 'pet:pet':
      mutate((s) => {
        setTransientMood(s, 'celebrating', 3500)
        pushLog(s, { at: Date.now(), type: 'petted' })
      })
      playSound('purr')
      return

    case 'pet:rename':
      mutate((s) => {
        s.pet.name = intent.name.trim() || s.pet.name
      })
      onTrayNeedsUpdate()
      return

    // -- reminders --------------------------------------------------------
    case 'reminder:confirm':
      mutate((s) => confirmReminder(s, intent.reminderId))
      playSound('confirm')
      return

    case 'reminder:snooze':
      mutate((s) => snoozeReminder(s, intent.reminderId, intent.minutes))
      return

    case 'reminder:toggle':
      mutate((s) => {
        const r = s.reminders.find((x) => x.id === intent.reminderId)
        if (r) r.enabled = intent.enabled
      })
      return

    case 'reminder:update':
      mutate((s) => {
        const i = s.reminders.findIndex((x) => x.id === intent.reminder.id)
        if (i >= 0) s.reminders[i] = intent.reminder
      })
      return

    case 'reminder:add':
      mutate((s) => s.reminders.push(intent.reminder))
      return

    case 'reminder:remove':
      mutate((s) => {
        s.reminders = s.reminders.filter((r) => r.id !== intent.reminderId)
      })
      return

    case 'bubble:dismiss':
      mutate((s) => {
        s.bubbles = s.bubbles.filter((b) => b.id !== intent.bubbleId)
      })
      return

    // Choosing to keep scrolling is a valid answer, and it is taken at face
    // value — no follow-up, no second prompt, nothing deducted.
    case 'doomscroll:continue':
      mutate((s) => {
        s.runtime.doomscrollSnoozeUntil = Date.now() + intent.minutes * 60_000
        s.bubbles = s.bubbles.filter((b) => b.kind !== 'doomscroll')
        clearNudges(s)
      })
      return

    case 'doomscroll:return':
      mutate((s) => {
        rewardReturn(s)
        if (s.session) s.session.returns += 1
        pushLog(s, { at: Date.now(), type: 'returned_from_distraction' })
        s.bubbles = s.bubbles.filter((b) => b.kind !== 'doomscroll')
        clearNudges(s)
      })
      return

    case 'bridge:regenerateToken':
      mutate((s) => {
        s.settings.bridgeToken = makeBridgeToken()
      })
      return

    // -- settings & windows ------------------------------------------------
    case 'settings:patch':
      mutate((s) => {
        s.settings = { ...s.settings, ...intent.patch, llm: { ...s.settings.llm, ...intent.patch.llm } }
      })
      applyCatSettings(getState().settings)
      if (intent.patch.launchAtLogin !== undefined && app.isPackaged) {
        app.setLoginItemSettings({ openAtLogin: intent.patch.launchAtLogin })
      }
      onTrayNeedsUpdate()
      return

    case 'window:showMain':
      showMain()
      mutate(clearNudges)
      return

    case 'window:hideMain':
      hideMain()
      publish()
      return

    case 'cat:setVisible':
      setCatVisible(intent.visible)
      onTrayNeedsUpdate()
      publish()
      return

    // -- data ---------------------------------------------------------------
    case 'data:openFolder':
      await shell.openPath(getDataDir())
      return

    case 'data:export': {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Export everything',
        defaultPath: join(app.getPath('downloads'), `pawse-export-${today()}.json`),
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (canceled || !filePath) return { ok: false, error: 'cancelled' }
      const { runtime: _runtime, ...rest } = getState()
      writeFileSync(filePath, JSON.stringify(rest, null, 2), 'utf-8')
      return { ok: true, data: { filePath } }
    }

    case 'data:deleteHistory': {
      const confirmed = await confirmDestructive(
        'Delete history?',
        'Your activity log and insights will be removed. Your cat, quests, and reminders stay.'
      )
      if (!confirmed) return { ok: false, error: 'cancelled' }
      mutate((s) => {
        s.log = []
      })
      return
    }

    case 'data:deleteEverything': {
      const confirmed = await confirmDestructive(
        'Delete everything?',
        'This removes all Pawse data on this computer — the cat, quests, reminders, and history. It cannot be undone.'
      )
      if (!confirmed) return { ok: false, error: 'cancelled' }
      replaceState(createInitialState())
      onTrayNeedsUpdate()
      return
    }

    default: {
      const never: never = intent
      throw new Error(`Unhandled intent: ${JSON.stringify(never)}`)
    }
  }
}

async function confirmDestructive(message: string, detail: string): Promise<boolean> {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Cancel', 'Delete'],
    defaultId: 0,
    cancelId: 0,
    message,
    detail
  })
  return response === 1
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function findChapter(
  state: ReturnType<typeof getState>,
  questId: string,
  chapterId: string
): { done: boolean } | undefined {
  return state.quests.find((q) => q.id === questId)?.chapters.find((c) => c.id === chapterId)
}
