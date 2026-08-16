# Pawse — build plan

**Deadline: Sun 17 Aug 2026, 04:00 GMT+6. Written at 22:55, 16 Aug → ~5h left.**
Budget: 3h 30m code · 40m video+writeup · 20m buffer. **Stop coding at 03:00 no matter what.**

---

## 0. Decisions (already made, don't relitigate)

| Thing | Choice | Why |
|---|---|---|
| Shell | **Electron + electron-vite + React + TS** | Node 24 is installed, Rust is not. Tauri = 1h of toolchain install we don't have. |
| Scaffold cmd | `npm create @quick-start/electron@latest` → react-ts | Gives main/preload/renderer + HMR in one command. |
| Storage | **One JSON file**, atomic write, in `app.getPath('userData')` | Zero native modules, offline by definition, and "Export everything" in Settings = copy the file. SQLite costs 30min of node-gyp roulette for nothing today. |
| LLM | `@anthropic-ai/sdk`, **`claude-opus-5`**, called **from the main process only** | Never from the renderer (key exposure). $5/$25 per Mtok; quest gen is ~2k in / 1k out ≈ a fraction of a cent per call. |
| Notion | **Cut.** Import = paste text / open a `.txt`/`.md` | OAuth in 3.5h is not happening. Be honest in the demo. |
| Room | **Cut** (per your call). Keep a small food strip so rewards land somewhere. |
| Chrome extension | **Tier 2** — build only if the core is done by 02:00 |

### Offline rule
Everything works with the network unplugged **except**: quest generation (LLM), extension-driven site filtering. Every one of those has a local fallback — the app never shows an error wall.

---

## 1. Scope: three tiers

### Tier 1 — must exist or there is no demo (target: done by 01:15)
1. Two windows: main dashboard + transparent always-on-top cat.
2. Tray ("stash"): close main → hides to tray, **cat stays**. Quit from tray → **cat goes too**.
3. Start Focus → main window hides to tray, cat shows a small HUD.
4. Focus timer runs **in the main process**, cat reacts (studying / break / sleeping).
5. Pet: segmented **health** + **hunger** bars, decaying, restored by care actions + feeding.
6. Reminders = cat speech bubbles with buttons (`drank it` / `later`).
7. Quests list → quest detail → tick a chapter → get food/currency → feed cat.
8. Everything persists to disk and survives a restart.

### Tier 2 — pick ONE at 02:00 (both only if two people)
- **(a) LLM quest generation** — paste assignment text → structured JSON → chapters. *Recommended if solo:* it's the core idea and it's the "Best Use of AI" bonus track ($250).
- **(b) Chrome extension gatekeeper** — hides YouTube feed/Shorts during focus + reports doomscroll to the app over a local WebSocket. Very filmable, 15 seconds of great video.

### Tier 3 — do not start
Notion OAuth, room/decoration, outfits, mood check-ins, multi-theme adventures, app blocking, packaging installers.

---

## 2. Architecture (small, on purpose)

```
pawse/
  src/
    main/
      index.ts            app lifecycle, tray, quit flag
      windows/main.ts     dashboard window
      windows/cat.ts      transparent always-on-top window
      store.ts            JSON load/save (atomic), typed
      clock.ts            ONE 1s tick → focus + decay + reminders
      focus.ts            session state machine
      pet.ts              health/hunger decay + restore
      reminders.ts        schedule + due-check + batching
      llm.ts              Anthropic call + local fallback
      bridge.ts           (Tier 2) ws://127.0.0.1:17342 for the extension
      ipc.ts              one typed channel in, one broadcast out
    preload/index.ts      contextBridge: invoke() + on('state')
    renderer/             React: dashboard routes
    cat/                  React: sprite + bubble + bars (separate entry)
    shared/types.ts       AppState, events — imported by all three
  extension/              (Tier 2) MV3
```

**The one rule that matters:** timers, decay, and reminder scheduling live in `main`, never in a renderer. Renderer windows get hidden and throttled; a hidden window's `setInterval` will drift or stop and your session silently dies mid-demo.

**State flow:** renderer sends intents (`ipcRenderer.invoke('focus:start', …)`), main mutates state, main broadcasts the whole `AppState` to every open window on change. One shape, no sync bugs, no state library needed.

**Never accumulate ticks.** Store `startedAt` / `lastTickAt` as epoch ms and recompute from `Date.now()` every tick and on app boot (cap the catch-up at ~2h so an overnight sleep doesn't nuke the cat).

### Cat window config (the fiddly bit)

```ts
new BrowserWindow({
  width: 240, height: 260,
  transparent: true, frame: false, resizable: false,
  alwaysOnTop: true, skipTaskbar: true, hasShadow: false,
  webPreferences: { backgroundThrottling: false, preload }
})
win.setAlwaysOnTop(true, 'screen-saver')
win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
```

- `backgroundThrottling: false` or the cat freezes when unfocused. This is the #1 gotcha.
- **Click-through:** default `win.setIgnoreMouseEvents(true, { forward: true })`. In the cat renderer listen for `mousemove`; when the cursor is inside the sprite hit-box or an open bubble, IPC → `setIgnoreMouseEvents(false)`; on leave, back to `true`.
- **Dragging:** do it manually (`mousedown` → track `screen.getCursorScreenPoint()` → `win.setPosition()`), *not* `-webkit-app-region: drag`. The CSS version swallows clicks, so you'd lose petting. Manual drag also lets you tell a tap (pet) from a drag (move): moved <4px = pet.
- **Idle:** `powerMonitor.getSystemIdleTime()` — built in, no deps. >3 min idle → pause focus, cat sleeps, decay pauses.

### Tray

```ts
mainWindow.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); mainWindow.hide() } })
// tray menu → Quit: app.isQuitting = true; catWindow.destroy(); app.quit()
```
Menu: `Show Pawse` · `Hide cat` · `Pause reminders` · `Quit Pawse`.

---

## 3. Pet mechanics — keep the decay, remove the shame

You want health that drops from skipped water/stretch/breaks + mindless scrolling, and hunger that drops unless fed. Fine — but your own design doc says *"the pet is never harmed"*, and the judges grade on wellness impact and accessibility. A pet that visibly suffers because someone had a bad day is the exact thing that makes people uninstall wellness apps. So keep the mechanic, tune the teeth out of it:

- **Health floors at 25%.** Never zero. The cat never gets sick, never dies, never leaves.
- **Recovery always beats decay.** Decay ≈ 1 pip per 45 min of neglect; any single care action = +2 pips, instantly.
- **Decay only runs while you're actually at the computer** (not idle, not asleep). Coming back after a day off costs you nothing.
- **Low state = sleepy, not sick.** Cat curls up, colours cool down. No red, no alarm icon, no "!".
- **Copy:** "moss is getting sleepy" / "moss would like some water" — never "moss is unwell", never a streak-broken message.

Hunger: same shape. Food drops **randomly, weighted by diligence** — ~1 item per completed focus session, plus a small roll on each returned-from-distraction and each chapter ticked. Random enough to feel like a gift, frequent enough that the bar is never a chore.

Bars are **segmented pips (8–10 discrete blocks), not smooth fills** — Tamagotchi/Digimon LCD, not a web progress bar. Free authenticity, and it dodges the generic-app look instantly.

---

## 4. Design system — the anti-slop spec

Sample the exact hexes from your mockup PNGs; these are my read of them:

```css
:root{
  --ink:        #191B33;  /* outlines, text on cream */
  --bg:         #2B2E4F;  /* app background */
  --panel:      #343863;  /* sidebar active, raised rows */
  --cream:      #EDE7D6;  /* quest cards, callouts */
  --cream-dim:  #DCD4BE;
  --moss:       #8CBF69;  /* primary action */
  --moss-dark:  #6E9E4E;
  --coral:      #D97C79;  /* destructive only */
  --amber:      #E8A33D;  /* currency, warmth */
  --text:       #E8E6F0;
  --muted:      #A5A3C4;
}
```

**Type:** pixel display for headings + bitmap mono for body — exactly what your mockups do. Recommended: **Departure Mono** (OFL, free) as the workhorse, **Silkscreen** or **Pixelify Sans** for h1/h2. **Bundle the woff2 in the app** — no Google Fonts CDN, we're offline-first. Render at integer multiples of the design size (10/20/30px) or bitmap faces go mushy.

**Hard rules — break these and it reads as AI slop:**
1. `border-radius: 0`. (2px max, and only if you must.)
2. **No blurred shadows.** Hard offsets only: `box-shadow: 3px 3px 0 var(--ink)`.
3. **No gradients.** Where you'd reach for one, use a **2px dither/checker tile**.
4. **Diagonal hatch = absence.** You already use it for "away" in the day bar — reuse it for empty states, depleted pips, disabled toggles. One motif, used consistently, is what reads as designed-by-a-person.
5. The **perforated stamp edge** on quest cards is your signature. Build it once as a `border-image` / mask and use it everywhere a card matters.
6. Everything on a **4px grid**. Sprites scale by **integer factors only** + `image-rendering: pixelated`.
7. Motion: `steps(n)` for sprites, ≤120ms `ease-out` for UI. **No spring/bounce libraries.** Nothing eases for 400ms.
8. **No emoji as nav icons** — draw pixel glyphs. (Emoji on reminder rows is charming; keep those.)
9. Copy voice: lowercase-leaning, short, second person, calm. "you drank water" not "Great job! ✨". Zero exclamation marks in the base UI.
10. One deliberate imperfection per screen — the cat's frame rotated 1°, a hand-placed dot. Perfect symmetry is the tell.

**References worth 10 minutes, not an hour** — Lospec palette list (lospec.com/palette-list), Kenney's UI packs, itch.io game pages, Stardew Valley and Moonlighter menus, Tamagotchi/Digimon LCD screens (for the bars), classic System 7 chrome (hard 1px borders, hard shadows). Pinterest/Dribbble searches that return the good stuff: *"pixel art UI kit"*, *"cozy game UI"*, *"1-bit UI"*, *"Game Boy interface"*, *"retro OS UI"*.

---

## 5. Schedule (local time)

| Time | Block | Done means |
|---|---|---|
| 22:55–23:15 | **0 · Scaffold** | electron-vite app runs, boilerplate stripped, `tokens.css` + fonts in, **public GitHub repo pushed** |
| 23:15–00:15 | **1 · Shell** | ⭐ **Milestone A:** cat sits on the desktop, draggable, pettable; closing the dashboard leaves it there; quitting from the tray removes it. JSON store round-trips. |
| 00:15–01:15 | **2 · The loop** | ⭐ **Milestone B:** Start Focus → window hides → timer runs → reminder bubble appears → you tap `drank it` → health pip fills → session ends with a summary. **This alone is a submittable demo.** |
| 01:15–02:00 | **3 · Quests** | ⭐ **Milestone C:** quest list + detail, tick a chapter → food drops → feed the cat → hunger fills. Today screen reads real data. |
| 02:00–02:30 | **4 · Tier 2** | LLM quest gen **or** the extension. Not both if solo. |
| 02:30–03:00 | **5 · Polish** | Insights from real logged data, empty states, Settings wired, one clean `npm run build`. |
| 03:00 | 🛑 **CODE FREEZE** | Non-negotiable. |
| 03:00–03:40 | **6 · Ship** | Video recorded, README pushed, Devpost filled |
| 03:40–04:00 | Buffer | **Submit by 03:40.** Devpost lets you keep editing after you've submitted — submitting early costs nothing and missing the deadline costs everything. |

**If you fall behind:** cut in this order — extension → Insights → quest detail page (ship the list only) → LLM. Never cut the cat window or the tray behaviour; they're the whole identity.

---

## 6. Tier 2a — LLM quest generation

Main process only. `output_config.format` with a JSON schema so you get parseable chapters, not prose:

```ts
const res = await client.messages.create({
  model: 'claude-opus-5',
  max_tokens: 4000,
  output_config: { format: { type: 'json_schema', schema: QuestSchema } },
  messages: [{ role: 'user', content: assignmentText }],
})
```

Schema: `{ title, theme, chapters: [{ title, realTask, estMinutes, reward }] }` — `additionalProperties: false` and every field in `required`.

**Two rules:**
- **Always show the output for approval before saving.** Your doc promises Pawse never invents academic requirements — this is the screen that keeps that promise, and it's a good beat in the video.
- **Local fallback:** no key or no network → split the pasted text on headings/bullets into chapters and name them plainly. The demo must never dead-end.

API key: entered in Settings → Connections, stored in the local JSON. Fine for a hackathon; note it as a known limitation in the README (proper answer is OS keychain via `safeStorage`).

## 6b. Tier 2b — Chrome extension

MV3, ~100 lines. `content.js` on `youtube.com`: when the app says focus is on, inject CSS hiding `ytd-rich-grid-renderer`, Shorts shelf, and the watch-page sidebar; track `scrollY` delta and post a `doomscroll` message past a threshold. `background.js`: WebSocket to `ws://127.0.0.1:17342`, reconnect on close. Desktop side: `ws` package, broadcasts focus state, receives scroll events → cat bubble: *"still enjoying this, or did we get stuck scrolling?"* with `5 more min` / `back to work`.

---

## 7. Submission checklist (do not improvise this at 03:50)

- [ ] **Public repo** with a README (what it does, stack, how to run, known limits)
- [ ] **Demo video, 1–5 min**, hosted and *publicly viewable* — double-check the link in an incognito window
- [ ] **Project description written by you, not AI** — the rules explicitly deduct documentation *and* technical points if AI-written. I can build the app; you write this part in your own words.
- [ ] Track: **Wellness** (main)
- [ ] **Best Use of AI** bonus: separate report — prompts used, model (`claude-opus-5`), paid tier, how AI is used *in the product* (quest generation), not just to write code
- [ ] Team info with per-person contributions

**Video script (90 seconds, shoot in this order):**
1. Cat on the desktop, drag it, pet it. *"This is Moss. He lives here."* (10s)
2. Today → Start Focus → window slides to tray, cat gets a HUD. (15s)
3. Water bubble appears → tap `drank it` → health pip fills. (15s)
4. Quest detail → tick a chapter → food drops → feed the cat. (20s)
5. Paste an assignment → chapters generate → approve. (20s)
6. Insights: *"your longest focused stretches were 8–10pm."* (10s)

Record the whole thing in one take from `npm run dev` — no packaging needed, and judges explicitly don't require hosting.
