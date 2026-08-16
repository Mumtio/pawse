# Pawse

A calm, no-shame study companion. A pixel cat lives on the corner of your screen, keeps time with
you while you work, turns real assignments into quest chapters, and asks for water now and then.

Everything works offline and stays on your computer.

---

## What works today

- **Desktop cat** — frameless, transparent, always-on-top. Drag it anywhere, click to pet it,
  double-click to open the dashboard. Click-through by default, so it never blocks what's
  underneath.
- **Tray behaviour** — closing the dashboard tucks it away and leaves the cat on screen. Quitting
  from the tray is the only thing that takes the cat away.
- **Focus sessions** — 25/45/90/custom/open-ended, with breaks, three gatekeeper modes, and a
  per-session checklist. The timer lives in the main process, so it keeps running with every
  window hidden. Stepping away pauses it instead of burning it.
- **The cat's state** — segmented health and food bars. Health drains slowly while you're at the
  machine skipping care, and any single care action puts back more than 45 minutes took away. It
  floors well above empty: the cat gets sleepy, never sick, never gone.
- **A cat that can lose its temper** — stay on a blocked feed mid-session and it goes unimpressed;
  ignore that for another few minutes and it turns properly angry, with its own furious sprite and
  its own set of raised-voice lines. It's the one place the cat shouts, it's still angry at the
  tab rather than at you, and "five more minutes" is honoured even mid-shout. **Once it's angry the
  timer stops**, the same way stepping away stops it — a clock that keeps counting focused minutes
  while you scroll is lying about how the session went. It restarts the moment you're back.
- **Reminders as speech bubbles** — water, stretch, eye rest, stand up, wind-down, medication.
  Non-urgent ones wait for a gap in your work and arrive together instead of interrupting one at
  a time.
- **Quests** — assignments become chapters. Ticking one off earns treats and sometimes food, which
  is the only way food appears.
- **Quest generation** — paste an assignment and get chapters back, using whichever free model you
  connect. Falls back to a local splitter with no key and no network.
- **Gatekeeper extension** — hides YouTube's home feed, Shorts and watch sidebar, Reddit's front
  page, and X's timeline while a session runs. Notices long scroll stretches and has the cat ask
  about it once. The blocked list is yours to edit, and study sites can be marked as always-allowed
  in Settings › Focus & Gatekeeper.
- **Insights** — focus by hour, care streaks, and plain-language observations, computed locally.

## Not built yet

Notion sync, the pet's room and decoration, outfits, mood check-ins, app blocking, and packaged
installers. The Import button currently accepts pasted text rather than reading from Notion.

---

## Running it

Requires Node 20+.

```bash
npm install
npm run dev
```

`npm run build` produces the production bundle in `out/`. Packaging into an installer is not set
up yet — `npm run dev` is how to run it.

> **If Electron exits immediately** with `Cannot read properties of undefined (reading 'app')`,
> check that `ELECTRON_RUN_AS_NODE` is not set in your shell. That variable makes Electron boot as
> plain Node, so `require('electron')` returns a path string instead of the API.

### Fonts

The interface expects two pixel fonts that aren't committed. Drop the `.woff2` files into
`src/renderer/public/fonts/` and they're picked up automatically:

| File                            | Where to get it                                    |
| ------------------------------- | -------------------------------------------------- |
| `DepartureMono-Regular.woff2`   | departuremono.com                                   |
| `Silkscreen-Regular.woff2`      | Google Fonts — Silkscreen                           |

Without them everything still lays out correctly, just in your system monospace. They're loaded
from disk rather than a CDN so the app keeps working offline.

### Quest generation (optional, free)

Settings › Connections. Pawse doesn't ship a key and doesn't proxy anything — your key is stored
in the local data file and only ever sent to the provider you pick.

| Provider              | Notes                                                              |
| --------------------- | ------------------------------------------------------------------ |
| **Google AI Studio**  | Most generous free tier, no card. Key from aistudio.google.com/apikey |
| **OpenAI-compatible** | Groq, OpenRouter, Together, LM Studio — anything with `/chat/completions` |
| **Ollama**            | Fully local, no key, no network                                      |
| **None**              | Chapters are split locally by a deterministic heuristic              |

Generated chapters are **always shown for approval before anything is saved**. The model is asked
to regroup and rename work that is already in your text — never to invent requirements.

### Browser extension

1. `chrome://extensions` › enable **Developer mode** › **Load unpacked** › select `extension/`
2. Open the extension and enter the pairing code from Settings › Connections

The extension talks only to `127.0.0.1:17342` and must present that code, so a random web page
can't read your focus state just because it can reach localhost.

---

## How it's put together

```
src/main/       state, timers, windows, tray, the local bridge — owns everything
src/preload/    the entire renderer-facing API surface
src/renderer/   dashboard (index.html) and cat (cat.html), two entries, one bundle
src/shared/     types both sides import
extension/      MV3 gatekeeper
```

Two decisions carry most of the weight:

**Main owns all state.** Renderers send intents (`{type: 'reminder:confirm', ...}`) and re-render
from whatever state comes back. There is no state library and no cross-window sync, because
neither window is ever a source of truth.

**Every timer lives in the main process.** The dashboard hides itself when a session starts, and
hidden renderers get throttled — a timer running there would drift or stall. Elapsed time is
always derived from wall-clock timestamps rather than counted ticks, so suspending the laptop
mid-session doesn't desync anything.

The cat's drag loop also runs in main, polling the OS cursor. Sending a position per `pointermove`
leaves the window an IPC round-trip behind the cursor; once it trails far enough the pointer
leaves the window, capture is lost, and the cat drops mid-drag.

### Three traps in dragging a transparent window on Windows

All three were live bugs; they're recorded here because none of them is obvious and all of them
present as the same vague symptom — "the drag feels broken".

**`setPosition` grows the window at fractional DPI scaling.** At 125% or 150%, Electron round-trips
the window size through DIP↔physical conversion and writes the rounded result back, so the window
gains roughly a pixel per call. At 60Hz that measured 320×250 → 471×389 over about eight drags.
Because the sprite sits at the bottom-centre of a mostly transparent window, inflation slides the
cat out from under the cursor. **Always move the cat with `setBounds` and an explicit width and
height** so the rounding is corrected each frame instead of compounding — never `setPosition`.

**The grab offset must not cross coordinate spaces.** A renderer's `clientX` is in CSS pixels;
`getCursorScreenPoint()` and `setPosition` are in DIP screen coordinates. They agree only at 100%
scaling. Main computes the offset from `getCursorScreenPoint()` minus the window's own position,
and the renderer sends no coordinates at all.

**Clamping the window is not clamping the cat.** The window is far larger than the sprite drawn in
it, so forcing the whole window on-screen stops the cat reaching any edge and snaps it inward on
release. `clampCatToDisplay` only keeps a minimum slice of window on a display.

`PAWSE_DEBUG_DRAG=1` prints the cursor, window bounds, computed offset, display scale factor, and
per-frame `setBounds` timing for each drag.

### Storage

One JSON file at `%APPDATA%/pawse/data/pawse.json` (`~/.config` or `~/Library/Application Support`
elsewhere), written atomically via temp-file + rename. A corrupt file is set aside rather than
lost, and the app still opens. "Export everything" is a copy of this file.

---

## Privacy

- Activity analysis happens locally. Nothing is sent anywhere except the model provider you
  explicitly connect.
- The extension loads on every site, because the blocked list is editable at runtime and a manifest
  isn't. It only ever reports a **domain** for sites on one of your two lists; everywhere else it
  reports the single bit "unlisted" with no domain attached, which is all the cat needs to know you
  have left the feed. Never URLs, never page content, never anything typed.
- Tracking can be paused entirely, and history can be exported or deleted from Settings ›
  Privacy & data.
- Pawse never diagnoses anything, never recommends medication or dosage, and **never marks a dose
  taken on your behalf** — it records only what you tell it, and distinguishes "reminded" from
  "you confirmed".

### Known limitations

- The API key is stored in plain text in the local data file. It should use the OS keychain
  (`safeStorage`) instead.
- "Stay quiet during full-screen apps" is present in Settings but not yet wired up — detecting
  full-screen apps needs platform-specific APIs.
- The extension's CSS selectors target site markup that changes regularly, and will need
  occasional maintenance.

---

## Design notes

The interface follows a few rules deliberately, in `src/renderer/src/styles/tokens.css`:

- `border-radius: 0`, and hard offset shadows instead of blurred ones
- no gradients — a 2px dither pattern stands in wherever one would be reached for
- one diagonal hatch motif, meaning "absence", used for away time, empty states, and spent pips
- everything on a 4px grid; sprites scale by whole numbers only
- `steps()` easing for sprites, ≤120ms for interface motion, nothing bounces

The placeholder cat is drawn from character maps in `src/renderer/src/cat/sprites.ts` so the art is
reviewable in source. `PixelSprite` already accepts a PNG instead, so dropping in a real sprite
sheet is a one-prop change.
