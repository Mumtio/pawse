# Pawse

A calm, no-shame desktop study companion.

## Download and install

### Windows

1. Open the [latest Pawse release](https://github.com/Mumtio/pawse/releases/latest).
2. Download `Pawse-Setup-<version>.exe`.
3. Run the installer and follow the setup prompts.
4. Open Pawse from the desktop shortcut or Start menu.

Pawse runs in the system tray after its main window is closed. Use the tray menu to reopen or quit
the app.

Windows may show an unknown-publisher warning until Pawse releases are code-signed.

## API integrations

All integrations are optional. Pawse works without an API key and stores its settings locally on
your computer.

### AI quest generation

AI providers turn pasted assignments into suggested quest chapters. Without a provider, Pawse uses
its local chapter splitter.

1. Open **Settings > Connections** in Pawse.
2. Choose a provider:
   - **Google AI Studio:** create a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
   - **OpenAI-compatible:** enter the API key, model name, and provider base URL ending in `/v1`.
     This option supports services such as Groq, OpenRouter, Together, and LM Studio.
   - **Ollama:** run Ollama locally and use `http://127.0.0.1:11434`. No API key is required.
3. Enter the model name and API key when required, then save.
4. Open **Quests > Import**, paste an assignment, and review the suggested chapters before saving.

Your API key remains on your computer and is sent only to the provider you select.

### Notion

The Notion integration is read-only. Pawse does not create, edit, or delete workspace content.

1. Open [Notion integrations](https://www.notion.so/my-integrations) and create an internal
   integration.
2. Give it **Read content** access and copy its Internal Integration Secret.
3. In Pawse, open **Settings > Connections**, paste the secret, and select **Test connection**.
4. In Notion, open the page or database you want to import and share it with the integration.
5. In Pawse, open **Quests > Import > From Notion**, select the content, and review the chapters
   before saving.

A new Notion integration cannot access anything until you explicitly share a page or database with
it.

### Browser extension

The optional Chrome extension hides distracting feeds during focus sessions and reports blocked
sites to the desktop cat.

1. Download or clone the Pawse repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the repository's `extension/` folder.
5. Open the extension and enter the pairing code shown under **Settings > Connections** in Pawse.
6. Reload any tabs that were already open.

Pawse should show the extension as **Paired**. If you regenerate the pairing code, pair the extension
again with the new code.
