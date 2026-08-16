import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import type { Settings } from '@shared/types'

/**
 * Two windows:
 *  - main: the dashboard. Closing it hides it to the tray; the cat stays.
 *  - cat:  a frameless, transparent, always-on-top companion window.
 *
 * The cat window is click-through by default so it never blocks whatever you
 * are actually working on. The renderer tells us when the cursor is over the
 * sprite or an open bubble, and only then do we accept mouse events.
 */

/**
 * Sized for the worst case, not the average one.
 *
 * The cat sits at the bottom and speech bubbles stack above it, so the window
 * has to fit sprite + bars + HUD + a bubble of several lines with buttons. Size
 * it for a bare cat and anything the cat says gets clipped off the top.
 *
 * Being generous is free here: the window is transparent and click-through
 * everywhere except the sprite and an open bubble, so the extra area is not
 * visible and does not block anything underneath.
 */
const CAT_SIZES: Record<Settings['catSize'], { width: number; height: number }> = {
  S: { width: 300, height: 340 },
  M: { width: 340, height: 380 },
  L: { width: 400, height: 440 }
}

// The matching sprite scales live in the cat renderer (CAT_SPRITE_SCALE);
// change both together or the cat stops fitting its window.

let mainWindow: BrowserWindow | null = null
let catWindow: BrowserWindow | null = null

/**
 * The size the cat window is *supposed* to be.
 *
 * On Windows at fractional display scaling (125%, 150%), `setPosition` round-
 * trips the window size through DIP↔physical conversion and writes back the
 * rounded result, so the window grows about a pixel per call. Over one drag
 * that is tens of pixels: the sprite sits at the bottom-centre of the window,
 * so it slides out from under the cursor as the window inflates, and every
 * size-dependent calculation downstream (clamping, the grab offset) starts
 * working from a number that is no longer true.
 *
 * Keeping the intended size here and passing it explicitly on every move means
 * the error is corrected each frame instead of accumulating.
 */
let intendedSize = { width: 320, height: 250 }

const preload = join(__dirname, '../preload/index.js')
const isDev = !!process.env['ELECTRON_RENDERER_URL']

function rendererUrl(page: 'index' | 'cat'): string {
  return `${process.env['ELECTRON_RENDERER_URL']}/${page}.html`
}

function rendererFile(page: 'index' | 'cat'): string {
  return join(__dirname, `../renderer/${page}.html`)
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function getCatWindow(): BrowserWindow | null {
  return catWindow
}

export function createMainWindow(onCloseRequested: () => void): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 900,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#2B2E4F',
    title: 'Pawse',
    webPreferences: { preload, sandbox: false }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // The X button is "put it away", not "quit". Quitting is a tray decision,
  // because that's the one that also takes the cat off the screen.
  mainWindow.on('close', (e) => {
    e.preventDefault()
    onCloseRequested()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) mainWindow.loadURL(rendererUrl('index'))
  else mainWindow.loadFile(rendererFile('index'))

  return mainWindow
}

export function createCatWindow(settings: Settings): BrowserWindow {
  const size = CAT_SIZES[settings.catSize] ?? CAT_SIZES.M
  intendedSize = { ...size }
  // A missing or malformed saved position must fall back explicitly: passing
  // undefined x/y to BrowserWindow makes Electron centre the window, which is
  // the one place a desktop pet should never be.
  const saved = settings.catPosition
  const pos =
    saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
      ? { x: Math.round(saved.x), y: Math.round(saved.y) }
      : defaultCatPosition(size)

  catWindow = new BrowserWindow({
    ...size,
    x: pos.x,
    y: pos.y,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    title: 'Moss',
    webPreferences: {
      preload,
      sandbox: false,
      // Without this the cat freezes the moment the window loses focus —
      // which is always, since it is never the window you're working in.
      backgroundThrottling: false,
      // This window hosts the sound cues and is never clicked in the ordinary
      // way, so it would otherwise sit behind Chromium's gesture requirement
      // and stay silent forever.
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  // 'screen-saver' keeps it above ordinary always-on-top windows.
  catWindow.setAlwaysOnTop(true, 'screen-saver')
  catWindow.setVisibleOnAllWorkspaces(settings.showOnAllWorkspaces, {
    visibleOnFullScreen: !settings.hideDuringFullscreen
  })
  catWindow.setIgnoreMouseEvents(true, { forward: true })

  // A saved position can be stale: a monitor was unplugged, the layout
  // changed, or an older build wrote something out of range. Pull it back on
  // screen at startup rather than opening the cat somewhere invisible.
  const onScreen = clampCatToDisplay(pos.x, pos.y)
  if (onScreen.x !== pos.x || onScreen.y !== pos.y) {
    catWindow.setPosition(onScreen.x, onScreen.y, false)
  }

  catWindow.on('ready-to-show', () => catWindow?.showInactive())

  if (isDev) catWindow.loadURL(rendererUrl('cat'))
  else catWindow.loadFile(rendererFile('cat'))

  return catWindow
}

/** Bottom-right by default, positioned so the cat — not the window — sits there. */
function defaultCatPosition(size: { width: number; height: number }): { x: number; y: number } {
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: Math.round(workArea.x + workArea.width - size.width / 2 - 90),
    y: Math.round(workArea.y + workArea.height - size.height + CAT_CENTRE_FROM_BOTTOM - 8)
  }
}

/**
 * Keep the *cat* reachable, not the window.
 *
 * These two are not the same thing, and conflating them is a bug in both
 * directions. The window is much bigger than the sprite and the sprite sits at
 * the bottom centre, with transparent space above it for speech bubbles. Clamp
 * the window fully inside the work area and the cat can never reach a screen
 * edge; clamp it loosely and you can leave a sliver of empty window on screen
 * while the cat itself is completely off it.
 *
 * So the constraint is on the cat's own centre point, and the window is free
 * to hang off the edge — which is exactly where people park a desktop pet.
 */

/** Roughly how far the sprite's middle sits above the bottom of the window. */
const CAT_CENTRE_FROM_BOTTOM = 78

/** How much room the cat's centre keeps from any work-area edge. */
const CAT_MARGIN = 56

export function clampCatToDisplay(x: number, y: number): { x: number; y: number } {
  if (!catWindow) return { x, y }
  // Use the intended size, not getSize(): the platform reports a rounded value
  // at fractional scaling, and this needs to agree with what we actually set.
  const { width, height } = intendedSize
  const area = screen.getDisplayNearestPoint({ x, y }).workArea

  // Where the cat's middle ends up, given a window at (x, y).
  const offsetX = width / 2
  const offsetY = height - CAT_CENTRE_FROM_BOTTOM

  const minX = area.x + CAT_MARGIN - offsetX
  const maxX = area.x + area.width - CAT_MARGIN - offsetX
  const minY = area.y + CAT_MARGIN - offsetY
  const maxY = area.y + area.height - CAT_MARGIN - offsetY

  return {
    x: Math.round(Math.min(Math.max(x, minX), maxX)),
    y: Math.round(Math.min(Math.max(y, minY), maxY))
  }
}

export function setCatInteractive(interactive: boolean): void {
  if (!catWindow || catWindow.isDestroyed()) return
  catWindow.setIgnoreMouseEvents(!interactive, { forward: true })
}

/**
 * Always move via setBounds with an explicit size. setPosition leaves the size
 * to the platform, which is what lets it drift — see `intendedSize`.
 */
export function moveCat(x: number, y: number, clamp = true): { x: number; y: number } {
  if (!catWindow || catWindow.isDestroyed()) return { x, y }
  const target = clamp ? clampCatToDisplay(x, y) : { x: Math.round(x), y: Math.round(y) }
  catWindow.setBounds({ ...target, ...intendedSize }, false)
  return target
}

/**
 * Undo any size drift that has already crept in.
 *
 * The tolerance matters: at fractional scaling the platform reports the size
 * back a pixel or two off whatever we set, so an exact comparison would
 * "correct" a window that is already right on every single call.
 */
const SIZE_TOLERANCE = 3

function enforceCatSize(): void {
  if (!catWindow || catWindow.isDestroyed()) return
  const b = catWindow.getBounds()
  const dh = intendedSize.height - b.height
  const off =
    Math.abs(b.width - intendedSize.width) > SIZE_TOLERANCE || Math.abs(dh) > SIZE_TOLERANCE
  if (!off) return

  // Grow upward, not downward. The sprite is anchored to the bottom of the
  // window, so holding the top edge fixed would visibly shove the cat down
  // the screen every time the window changed size.
  const settled = clampCatToDisplay(b.x, b.y - dh)
  catWindow.setBounds({ ...settled, ...intendedSize }, false)
}

// ---------------------------------------------------------------------------
// Dragging
// ---------------------------------------------------------------------------

/**
 * The drag loop runs here rather than in the renderer, and reads the real
 * cursor position straight from the OS.
 *
 * Sending a position per pointermove means the window is always one IPC
 * round-trip behind the cursor. Once it trails far enough the pointer leaves
 * the window, capture is lost, and the cat drops mid-drag. Polling the cursor
 * from main keeps the grab offset exact, so the cursor stays over the sprite
 * for the whole gesture and the pointerup always lands.
 */

const DRAG_INTERVAL_MS = 16
/** If the renderer never reports the release, don't drag forever. */
const DRAG_SAFETY_MS = 60_000

let dragTimer: NodeJS.Timeout | null = null
let dragDeadline: NodeJS.Timeout | null = null
let dragOffset = { x: 0, y: 0 }
let dragOrigin = { x: 0, y: 0 }
let dragMaxMoved = 0
let dragLast = { x: 0, y: 0 }
let dragFrames = 0
let dragMoveMs = 0
let dragWorstMs = 0

/**
 * The grab offset is worked out here, from `getCursorScreenPoint()` minus the
 * window's own position — both DIP screen coordinates.
 *
 * The renderer deliberately supplies nothing: its `clientX` is in CSS pixels,
 * and mixing that with DIP only agrees at 100% display scaling. Anywhere else
 * the window jumps by the scaling error the moment you press.
 */
export function beginCatDrag(): void {
  if (!catWindow || catWindow.isDestroyed()) return
  clearDragTimers()

  // Correct any drift before measuring, so the grab offset is taken against
  // the size the window is meant to be.
  enforceCatSize()

  const cursor = screen.getCursorScreenPoint()
  const [wx, wy] = catWindow.getPosition()
  dragOffset = { x: cursor.x - wx, y: cursor.y - wy }
  dragOrigin = cursor
  dragLast = { x: wx, y: wy }
  dragMaxMoved = 0
  dragFrames = 0
  dragMoveMs = 0
  dragWorstMs = 0

  // Keep the window clickable for the whole gesture so the release is heard.
  setCatInteractive(true)

  if (process.env.PAWSE_DEBUG_DRAG) {
    const b = catWindow.getBounds()
    const [sw, sh] = catWindow.getSize()
    const [cw, ch] = catWindow.getContentSize()
    const d = screen.getDisplayNearestPoint(cursor)
    console.log(
      `[drag] start cursor=${cursor.x},${cursor.y} pos=${wx},${wy} offset=${dragOffset.x},${dragOffset.y}\n` +
        `       bounds=${b.x},${b.y} ${b.width}x${b.height} size=${sw}x${sh} content=${cw}x${ch}\n` +
        `       display scale=${d.scaleFactor} bounds=${d.bounds.width}x${d.bounds.height} ` +
        `workArea=${d.workArea.x},${d.workArea.y} ${d.workArea.width}x${d.workArea.height}`
    )
  }

  dragTimer = setInterval(() => {
    if (!catWindow || catWindow.isDestroyed()) {
      clearDragTimers()
      return
    }
    const pt = screen.getCursorScreenPoint()
    const nx = pt.x - dragOffset.x
    const ny = pt.y - dragOffset.y

    // Moving a transparent window forces a full recomposite on Windows, so
    // don't ask for one when the cursor hasn't actually gone anywhere.
    if (nx === dragLast.x && ny === dragLast.y) return
    dragLast = { x: nx, y: ny }

    dragMaxMoved = Math.max(
      dragMaxMoved,
      Math.abs(pt.x - dragOrigin.x) + Math.abs(pt.y - dragOrigin.y)
    )

    const t0 = Date.now()
    // setBounds with an explicit size, never setPosition — see `intendedSize`.
    catWindow.setBounds({ x: nx, y: ny, ...intendedSize }, false)
    const took = Date.now() - t0
    dragFrames += 1
    dragMoveMs += took
    dragWorstMs = Math.max(dragWorstMs, took)
  }, DRAG_INTERVAL_MS)

  dragDeadline = setTimeout(() => finishCatDrag(), DRAG_SAFETY_MS)
}

export function isDraggingCat(): boolean {
  return dragTimer !== null
}

/** Stops the loop, settles the window on screen, and reports the gesture. */
export function finishCatDrag(): { moved: number; position: { x: number; y: number } } {
  const wasDragging = dragTimer !== null
  clearDragTimers()

  if (!catWindow || catWindow.isDestroyed()) {
    return { moved: dragMaxMoved, position: { x: 0, y: 0 } }
  }

  const [x, y] = catWindow.getPosition()
  const position = wasDragging ? clampCatToDisplay(x, y) : { x, y }
  // Settle on the final spot at the size the window is meant to be.
  catWindow.setBounds({ ...position, ...intendedSize }, false)

  if (wasDragging && process.env.PAWSE_DEBUG_DRAG) {
    const avg = dragFrames > 0 ? (dragMoveMs / dragFrames).toFixed(1) : '0'
    console.log(
      `[drag] end at=${x},${y} clamped=${position.x},${position.y} moved=${dragMaxMoved} ` +
        `frames=${dragFrames} setPosition avg=${avg}ms worst=${dragWorstMs}ms`
    )
  }

  return { moved: dragMaxMoved, position }
}

function clearDragTimers(): void {
  if (dragTimer) clearInterval(dragTimer)
  if (dragDeadline) clearTimeout(dragDeadline)
  dragTimer = null
  dragDeadline = null
}

export function setCatVisible(visible: boolean): void {
  if (!catWindow || catWindow.isDestroyed()) return
  if (visible) catWindow.showInactive()
  else catWindow.hide()
}

export function applyCatSettings(settings: Settings): void {
  if (!catWindow || catWindow.isDestroyed()) return
  const size = CAT_SIZES[settings.catSize] ?? CAT_SIZES.M
  intendedSize = { ...size }
  // Resize about the existing top-left rather than letting the platform
  // decide, so changing the cat's size never relocates it.
  enforceCatSize()
  catWindow.setVisibleOnAllWorkspaces(settings.showOnAllWorkspaces, {
    visibleOnFullScreen: !settings.hideDuringFullscreen
  })
}

export function showMain(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

export function hideMain(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.hide()
}

export function destroyWindows(): void {
  clearDragTimers()
  catWindow?.destroy()
  catWindow = null
  mainWindow?.destroy()
  mainWindow = null
}

export function broadcast(channel: string, payload: unknown): void {
  for (const win of [mainWindow, catWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  }
}
