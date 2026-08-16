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
- **Notion import** — pull an assignment straight from a Notion page instead of pasting it. Read
  only: Pawse never creates, edits, or deletes anything in a workspace, and the integration can
  only see pages you explicitly share with it.
- **Gatekeeper extension** — hides YouTube's home feed, Shorts and watch sidebar, Reddit's front
  page, and X's timeline while a session runs. Notices long scroll stretches and has the cat ask
  about it once. The blocked list is yours to edit, and study sites can be marked as always-allowed
  in Settings › Focus & Gatekeeper.
- **Insights** — focus by hour, where your time went per site, how much of it was on blocked ones,
  and plain-language observations. All computed locally.

## Not built yet

The pet's room and decoration, outfits, mood check-ins, app blocking (as opposed to site blocking),
and packaged installers. Notion import is one-way and manual — there's no background sync, and
nothing is ever written back to a workspace.

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

### Notion

Uses an **internal integration token**, not OAuth. A desktop app that ships its own source can't
keep a client secret — every install would share one and anyone could lift it from the repo. An
internal token is created by you, stays on your machine, and is revocable from Notion's settings
without involving Pawse.

1. `notion.so/my-integrations` › **New integration** › read-only capabilities are enough
2. Paste its Internal Integration Secret into Settings › Connections
3. **Open the page you want to import and share it with your integration** from its ⋯ menu

Step 3 is the one people miss. A new integration starts with access to nothing, so a valid token
on its own will still return an empty list — which also means the blast radius of this feature is
exactly the pages you deliberately connect.

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

---

## How we built it

The features below are the ones that had to be designed, not just implemented. Each one is a
small set of rules that the rest of the app is not allowed to break.

### The cat's state

Health and hunger are segmented pips, not smooth bars, and they live in main with everything
else. Health drains at one pip per 45 minutes while you are actually at the machine skipping
care; hunger is slower. Any single care action — water, a stretch, a pet, a feed — puts back
more than 45 minutes took away, so recovery always outruns neglect.

It floors well above empty. The cat gets drowsy, never sick, never gone. Catch-up after a
weekend is capped at two hours, so shutting the laptop is not treated as abandonment. Time
spent away from the keyboard does not drain at all.

Mood is derived each tick from what is actually happening: studying during a running session,
asleep when you step away, unimpressed if you drift onto a blocked feed mid-session, furious
if you stay there. Transient moods (eating, celebrating, dangling while dragged) overlay that
for a few seconds, then the derived one takes back over. The renderer never decides how the
cat feels — it draws whatever main last published.

### Reactions

The cat speaking up is a nudge, not a lecture. Unprompted remarks fill silence; they never
talk over a reminder, a scroll check-in, or an unanswered question. Talkativeness is a slider
with a real unit — "at most one bubble every N minutes" — and at zero the cat only speaks
when spoken to.

The one place it is allowed to be direct is a feed during a session you started. First it
goes unimpressed and asks. Ignore that for another few minutes and it turns properly angry:
its own sprite, its own raised-voice lines, and the timer stops, because a clock that keeps
counting focused minutes while you scroll is lying about how the session went. It is angry at
the tab, not at you. "Five more minutes" is honoured even mid-shout, and coming back pays back
the slip so the net for someone who returns is zero.

The lines are written for the cat. No quotes, no streak-talk, no "you've done nothing all
day". A question always has a button; a remark fades on its own.

### The timer

The dashboard hides the moment a session starts, and hidden Chromium windows get throttled, so
the clock cannot live in the renderer. One heartbeat in the main process advances the pet,
the session, reminders, and nudges. Elapsed time is always `now - startedAt`, never a counted
tick, so sleeping the laptop mid-session does not desync anything.

Two things pause the clock on your behalf, and neither counts as an interruption. Stepping
away past the idle threshold pauses it instead of burning it. Staying on a blocked feed long
enough that the cat is properly cross does the same. Both resume by themselves the moment the
condition clears. A pause you started by hand is left alone.

Open-ended sessions (zero minutes planned) count up and never self-end. Planned ones hand off
to a break, then a summary. A session only pays out if it was actually worked; abandoning
early costs nothing — it just doesn't earn.

### Notion integration

A desktop app that ships its own source cannot keep an OAuth client secret, so Pawse uses an
**internal integration token** you create and can revoke from Notion's settings without
involving us. The integration starts with access to nothing: you share pages with it one by
one, which is the blast radius of the feature.

It is read-only. Pawse never creates, edits, or deletes anything in a workspace. A page is
flattened to plain text — headings, list markers, and checkbox state kept, because those
change meaning for the quest splitter; everything else dropped. Inline databases, linked
pages, and property-only database rows are followed, because a study plan is often an index
of other pages rather than the work itself. Depth and block count are capped so one import
cannot walk a whole wiki.

The text then goes through exactly the same generator as the paste box. Notion is a new way
in, not a second pipeline — the approval step, the offline fallback, and the "never invent
requirements" contract all apply unchanged. Page text is pulled on demand for that one import
and is not stored or synced.

### The Chrome extension

MV3, loaded unpacked from `extension/`. It has to inject on every site because the blocked
list is yours to edit at runtime and a manifest cannot be rewritten — but it acts on almost
none of them. Which sites it touches is re-read from Pawse every few seconds.

Content scripts cannot reliably fetch localhost (page CSP gets in the way), so they message
the service worker and the worker talks to `127.0.0.1:17342`. The worker is allowed to die
between messages. Requests must present the pairing code from Settings, so a random page
cannot read your focus state just because it can reach localhost.

Gentle mode asks before hiding anything. Deep hides feeds and recommendations. Strict blocks
the listed sites until the break. Hiding uses two methods on purpose: CSS on stable hooks
(custom elements, ARIA roles, test ids), and JS on labels and link targets for Reels/Shorts,
whose class names change without warning. Nothing blocks navigation. Search, messages, and
anything you opened on purpose still work; only the infinite parts go quiet.

### LLM calls

Quest generation is optional and provider-agnostic: Google AI Studio, anything
OpenAI-compatible (Groq, OpenRouter, Together, LM Studio), local Ollama, or nothing. Pawse
does not ship a key and does not proxy anything. Your key is stored in the local data file
and only ever sent to the provider you pick.

The model is asked to regroup and rename work that is already in the text. It is never asked
to invent requirements, deadlines, or deliverables. `realTask` stays in your words; `title`
is the playful renaming. Results always land as a draft you approve before anything is saved.

If there is no key, no network, or the call fails (30s timeout), a deterministic local
splitter does the same job: it only ever retitles lines that are already there, and prefers
unticked checkboxes when a page has them. Generation must never be the reason the app cannot
be used.

### Local storage

One JSON file at `%APPDATA%/pawse/data/pawse.json` (`~/.config` or `~/Library/Application
Support` elsewhere). Written atomically — temp file, then rename — so a crash mid-write can
never leave a truncated file. A corrupt file is copied aside rather than overwritten, and
the app still opens on a fresh cat.

On load, missing fields are back-filled so a new setting never lands as `undefined` in the
UI. Stale bubbles and half-finished sessions are dropped; they cannot be resumed
meaningfully. The activity log is append-only, capped, and never includes page content. Time
per site is aggregated by local day rather than logged per extension poll, or a week of
browsing would be tens of thousands of rows to answer a question that only needs a total.

"Export everything" is a copy of this file. "Delete history" and "Delete everything" are
the same file with less in it. There is no account and no cloud copy.

### Privacy first

Nothing leaves the machine unless you connect a model or Notion, and even then the payload
is the thing you just asked to send — assignment text, or a page you shared with an
integration. Activity analysis, insights, and the cat's opinions are all computed locally
from that one file.

The extension is the sharp edge. It loads everywhere, reports a **domain** only for sites on
your two lists, and everywhere else reports the single bit "unlisted" with no domain
attached. That is enough for the cat to know you have left a feed. Never URLs, never page
content, never keystrokes. Tracking can be paused entirely from Settings or the tray.

Medication reminders are the other sharp edge. Pawse reminds you and records what you tell
it. It never marks a dose taken on your behalf, never asks what the medication is, and
distinguishes "reminded" from "you confirmed". Insights describe patterns ("your longest
stretches were between 8 and 10pm"); they do not diagnose, score, or grade.

The honest gap: API keys currently sit in that JSON file in plain text. They should use the
OS keychain (`safeStorage`) instead.

---

## Privacy

- Activity analysis happens locally. Nothing is sent anywhere except the model provider you
  explicitly connect, and Notion if you connect that.
- Notion access is read-only and scoped to the pages you share with your integration. Page text is
  pulled on demand for one import and is not stored or synced.
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
