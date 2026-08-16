import { app, Menu, nativeImage, Tray } from 'electron'
import { join } from 'node:path'
import { getState, mutate } from './appState'
import { getCatWindow, setCatVisible, showMain } from './windows'

/**
 * The tray is the "stash". Closing the dashboard tucks it away and leaves the
 * cat on screen; quitting from here is the one action that also takes the cat
 * away. That distinction is the whole point of the tray existing.
 */

let tray: Tray | null = null

function resourcePath(file: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, file)
    : join(__dirname, '../../resources', file)
}

export function createTray(onQuit: () => void): Tray {
  const image = nativeImage.createFromPath(resourcePath('tray.png'))
  image.setTemplateImage(true)

  tray = new Tray(image)
  tray.setToolTip('Pawse')
  tray.on('click', () => showMain())
  tray.on('double-click', () => showMain())
  updateTray(onQuit)
  return tray
}

export function updateTray(onQuit: () => void): void {
  if (!tray || tray.isDestroyed()) return
  const state = getState()
  const cat = getCatWindow()
  const catVisible = Boolean(cat && !cat.isDestroyed() && cat.isVisible())

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `${state.pet.name} · ${moodLabel(state.pet.mood)}`, enabled: false },
      { type: 'separator' },
      { label: 'Show Pawse', click: () => showMain() },
      {
        label: catVisible ? 'Hide cat' : 'Show cat',
        click: () => {
          setCatVisible(!catVisible)
          updateTray(onQuit)
        }
      },
      {
        label: 'Pause reminders',
        type: 'checkbox',
        checked: state.settings.trackingPaused,
        click: (item) => {
          mutate((s) => {
            s.settings.trackingPaused = item.checked
          })
          updateTray(onQuit)
        }
      },
      {
        label: 'Mute sounds',
        type: 'checkbox',
        checked: state.settings.muted,
        click: (item) => {
          mutate((s) => {
            s.settings.muted = item.checked
          })
          updateTray(onQuit)
        }
      },
      { type: 'separator' },
      { label: 'Quit Pawse', click: onQuit }
    ])
  )
}

function moodLabel(mood: string): string {
  switch (mood) {
    case 'studying':
      return 'studying'
    case 'break':
      return 'on a break'
    case 'sleeping':
      return 'asleep'
    case 'drowsy':
      return 'sleepy'
    case 'eating':
      return 'eating'
    default:
      return 'idle'
  }
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
