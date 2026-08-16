import { app, BrowserWindow } from 'electron'
import { initStorePaths, flushState } from './store'
import { getState, initState, publish } from './appState'
import { createCatWindow, createMainWindow, destroyWindows, hideMain, showMain } from './windows'
import { createTray, destroyTray, updateTray } from './tray'
import { registerIpc } from './ipc'
import { startClock, stopClock } from './clock'
import { startBridge, stopBridge } from './bridge'

/**
 * Pawse runs as a tray application, not a window application.
 *
 * Closing the dashboard hides it and leaves the cat on screen — the app is
 * still with you. Quitting from the tray is the only thing that takes the cat
 * away. Everything else follows from that one rule.
 */

let quitting = false

function quit(): void {
  quitting = true
  stopClock()
  stopBridge()
  flushState()
  destroyTray()
  destroyWindows()
  app.quit()
}

// A second launch should surface the window you already have, not start a
// second cat.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showMain())

  app.whenReady().then(() => {
    app.setAppUserModelId('com.pawse.app')

    initStorePaths()
    const state = initState()

    createMainWindow(() => {
      // The X button means "put it away".
      hideMain()
      publish()
    })
    createCatWindow(state.settings)
    createTray(quit)
    registerIpc(() => updateTray(quit))
    startClock()
    startBridge()

    if (state.settings.startMinimised) hideMain()
    publish()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow(() => {
          hideMain()
          publish()
        })
        createCatWindow(getState().settings)
      } else {
        showMain()
      }
    })
  })

  // Deliberately empty: closing every window must not end the process, or the
  // cat would vanish the first time you tidy your desktop.
  app.on('window-all-closed', () => {
    if (quitting) app.quit()
  })

  app.on('before-quit', () => {
    quitting = true
    flushState()
  })
}
