# Focus Flow

Focus Flow paces a writing session against a gentle words-per-hour ghost. Thinking and writing take turns. The counter shows whether you are ahead, even, or behind that pace. It does not use a countdown panic or a quota.

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
3. Choose a pace and the thinking and writing lengths in settings. The helper shows the pace in words per minute, and how much of that pace falls on the writing interval when thinking time counts.
4. Start the session. Only that note is counted.
5. Pause, add a minute, skip an interval, or end the session from the panel. On the desktop, the status bar shows the same phase and delta.

Reaching a goal plays a short chime and a glow. The session keeps going until you end it, unless you turn off "Keep going after the goal". The summary and the session callout appear only after the session ends.

If Obsidian closes mid-session and the note is still in the vault, the panel offers to resume. Time spent away is not added to the ghost.

## Checks

```bash
npm test
npm run lint
```

`npm run lint` uses `eslint-plugin-obsidianmd` and fails on any warning. A phone layout can be checked in the developer console with `app.emulateMobile(true)`.
