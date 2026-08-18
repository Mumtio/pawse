# Pawse

A desktop focus companion with a pixel cat. Everything below is optional except
the install itself — Pawse runs fine with no extension, no API key, and no Notion.

## Download Pawse

1. Open the [latest Pawse release](https://github.com/Mumtio/pawse/releases/latest).
2. Download `Pawse-Setup-<version>.exe`.
3. Run the installer and follow the setup prompts.
4. Open Pawse from the desktop shortcut or Start menu.

---

## Add the Chrome extension

The extension ("Pawse Gatekeeper") hides feeds and recommendations during a focus
session and reports time-per-site back to the app. It talks only to Pawse on
`127.0.0.1` — nothing leaves your computer. Without it, everything else still works.

It is not bundled with the installer, so grab the folder from this repo first.

**1. Get the `extension/` folder**

- Either clone: `git clone https://github.com/Mumtio/pawse.git`
- Or download the repo ZIP (green **Code** button › **Download ZIP**) and unzip it.

Either way you want the folder named `extension` (it contains `manifest.json`).

**2. Load it in Chrome**

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select the `extension` folder — not a file inside it, and not the repo root.
5. "Pawse Gatekeeper" appears in the list. Pin it from the puzzle-piece menu so
   you can reach it easily.

Works the same in any Chromium browser (Edge, Brave, Opera) — Edge uses
`edge://extensions`.

**3. Pair it with the app**

1. In Pawse, go to **Settings › Connections › Browser extension** and read the
   pairing code (formatted like `ABC-123`).
2. Click the extension icon in Chrome.
3. Type the code into the **pairing code** box and click **Pair**.
4. It should say *paired — <cat name> is idle* (or *in a focus session*). Settings ›
   Connections in the app now shows **Paired**.

If pairing fails:

- *"Pawse is not running on this computer"* — start the Pawse app, then click **Pair** again.
- *"that code does not match"* — re-read the code in Settings › Connections; it changes
  whenever you click **Re-pair**.
- Clicking **Re-pair** in the app invalidates the old code and disconnects the browser,
  so you'll need to enter the new code in the extension.

The extension only ever shares the domain, time on page, and long scroll stretches —
never URLs, page content, or anything you type.

---

## Add an LLM API key

Used only for turning assignment text into quest chapters. With no key, Pawse splits
chapters locally instead — you just get plainer chapter titles. Your key is stored on
your computer and is only ever sent to the provider you pick.

Go to **Settings › Connections › Quest generation** and choose a **Provider**:

### Google AI Studio (recommended — free tier, no card)

1. Go to <https://aistudio.google.com/apikey> and sign in with a Google account.
2. Click **Create API key** and copy it.
3. In Pawse, set Provider to **Google AI Studio**.
4. Paste the key into **API key**.
5. Leave **Model** as `gemini-2.0-flash` unless you have a reason to change it.

### OpenAI-compatible (Groq, OpenRouter, Together, LM Studio…)

Anything that serves `/chat/completions` works.

1. Create a key with your provider — e.g. Groq at <https://console.groq.com/keys>,
   or OpenRouter at <https://openrouter.ai/keys>.
2. In Pawse, set Provider to **OpenAI-compatible**.
3. Paste the key into **API key**.
4. Set **Model** to a model that provider serves, e.g. `llama-3.3-70b-versatile` for Groq.
5. Set **Base URL** to that provider's API root, without a trailing `/chat/completions`:
   - Groq — `https://api.groq.com/openai/v1` (the default if left blank)
   - OpenRouter — `https://openrouter.ai/api/v1`
   - Together — `https://api.together.xyz/v1`
   - LM Studio — `http://127.0.0.1:1234/v1`

### Ollama (fully local, no key)

1. Install Ollama from <https://ollama.com> and make sure it is running.
2. Pull a model: `ollama pull llama3.1`.
3. In Pawse, set Provider to **Ollama (local)**.
4. Set **Model** to the model you pulled (e.g. `llama3.1`).
5. Set **Base URL** to `http://127.0.0.1:11434` (the default if left blank).

### None (offline)

Leave the provider as **None (offline)**. Chapters are split locally, no network calls.

Settings save as you type. To check it works, create a quest from pasted text — if you
see a notice saying it was "made offline", the key or model isn't being accepted, and
the exact provider error is included in that notice.

---

## Integrate Notion

Lets you import an assignment straight from a Notion page instead of pasting it.
Pawse only ever **reads** — it never creates, edits, or deletes anything in your
workspace. It uses an internal integration token rather than OAuth, so the token is
created by you, stays on your machine, and is revocable from Notion at any time.

**1. Create an integration**

1. Go to <https://www.notion.so/my-integrations>.
2. Click **New integration**, give it a name (e.g. "Pawse"), and pick your workspace.
3. Under capabilities, give it **read content** only — Pawse never needs to write.
4. Submit, then copy the **Internal Integration Secret** (starts with `ntn_`).

**2. Paste the token into Pawse**

1. Go to **Settings › Connections › Notion**.
2. Paste the secret into **Integration token**.
3. Click **Test connection** — it should say *connected to <your workspace>*.

**3. Share the pages you want with the integration** (required)

A new integration can see *nothing* until you share pages with it, so a valid token on
its own will still find no pages.

1. Open the Notion page holding your assignment.
2. Click the **⋯** menu at the top-right.
3. Choose **Connections** (older Notion: **Add connections**) and pick your integration.
4. Confirm. Sharing a parent page also shares everything nested under it, which is the
   easiest way to expose a whole course folder at once.

**4. Import**

1. In Pawse, open **Quests** and click **Import**.
2. Choose the Notion source, then search your pages or leave the box blank to list
   everything shared with the integration.
3. Pick a page. Pawse pulls its text, generates chapters (using your LLM provider if
   configured), and shows the result for approval before anything is saved.

Troubleshooting:

- *nothing came back* — the page isn't shared with the integration yet; redo step 3.
- Token errors — regenerate the secret at notion.so/my-integrations and paste the new one.
- Very deep page trees are only read a few levels down, and long pages are truncated,
  so keep the assignment near the top of the page.
