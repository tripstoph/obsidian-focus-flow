# Focus Flow

Focus Flow paces a writing session against a gentle words-per-hour ghost. The counter shows whether you are ahead, even, or behind that pace. It counts every word you type, in any Markdown note.

This is a community plugin for Obsidian. It is not an official Obsidian product, and it is not affiliated with Dynalist Inc.

The plugin is offline. It does not use the network, telemetry, an account, or audio files. Session settings and records stay in the vault through Obsidian's plugin data.

## Install for development

The plugin folder inside `.obsidian/plugins/` must be named `focus-flow`, the same as the plugin id.

```bash
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into that folder, then enable Focus Flow in Obsidian.

## Use

1. Open a Markdown note.
2. Open the writing panel from the ribbon or the command "Open writing panel".
3. Choose a pace in settings. The helper shows that pace in words per minute.
4. Start the session. Words you type in any Markdown note count, and deleting them does not take them off the counter.
5. Stop the session from the panel. On the desktop, the status bar shows the same delta.

The summary and the session callout appear after you stop.

If Obsidian closes mid-session, the panel offers to resume. Time spent away is not added to the ghost.

## Checks

```bash
npm test
npm run lint
```

`npm run lint` uses `eslint-plugin-obsidianmd` and fails on any warning. A phone layout can be checked in the developer console with `app.emulateMobile(true)`.
