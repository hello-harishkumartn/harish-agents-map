# Harish Agents Map

A live 3D map of Harish's AI agents. Each desk is a cluster of floating hex islands, and each agent is a small animated robot standing at its own station. Robots glow, bob, shake or show a beacon depending on their status. Data packets fly to the Harish PA hub when an agent has recent activity, and a glass UI shows the live activity feed, each agent's routines and its action log. It is a pure static site (Three.js from a CDN, no build step), built with Claude Code.

**Live:** https://hello-harishkumartn.github.io/harish-agents-map/

## Enable GitHub Pages

1. Push this folder to the `main` branch of the `harish-agents-map` repo.
2. Go to **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Choose **Branch: `main`**, folder **`/ (root)`**, and save.

`.nojekyll` is included, so Pages serves the files exactly as they are. All paths are relative (`./status.json`, `./js/app.js`), so the site works under the `/harish-agents-map/` sub-path.

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Orbit | drag | one-finger drag |
| Zoom | scroll | pinch |
| Pan | right-drag | two-finger drag |
| Agent details | click a robot or its name tag | tap |
| Fly to desk | desk chips (bottom) or desk label | desk chips |
| Reset view | ⌂ button | ⌂ button |
| Close panel | `Esc` or ✕ | ✕ |

- Clicking a feed item focuses that agent's robot.
- Name tags hide when you zoom far out.
- On phones the activity feed and agent details are bottom sheets that start collapsed.
- With `prefers-reduced-motion`, animations are toned down and the camera moves instantly.
- Rendering pauses while the tab is hidden.

**Status visuals:** `working` makes the robot bob and wave with a bright visor and a pulsing ring. `idle` is calm and dim. `error` gives a red visor, a red ring and a small shake. `scheduled` (the next run is within 30 minutes) shows an amber beacon above the head. `never` is grey.

## Themes

**Midnight Neon** (default), **Daybreak**, **Aurora** and **Paper**. Each theme changes the sky, fog, ground, tiles, robot colours and UI colours. Switch themes with the ◐ button. Your choice is saved in `localStorage`.

## status.json schema

The page polls `./status.json?t=<timestamp>` every 60 s and updates the scene in place. If a fetch fails, it shows a toast and keeps the last good data. If `generated_at` is more than 90 minutes old, a **Stale** badge appears.

```jsonc
{
  "generated_at": "2026-10-08T14:58:00+05:30",   // ISO 8601 with +05:30 offset
  "timezone": "Asia/Calcutta (IST)",
  "desks": [
    { "id": "crypto", "name": "Crypto Desk", "color": "#14d3c2" }
  ],
  "agents": [
    {
      "id": "crypto-chart-watch",          // stable id
      "name": "Crypto Chart Watch",
      "desk": "crypto",                    // desk id
      "role": "What the agent does",
      "status": "working|idle|error|scheduled|never",
      "last_action": "text or null",
      "last_run": "ISO +05:30 or null",
      "next_run": "ISO +05:30 or null",
      "routines": [
        { "name": "…", "schedule": "Daily 6:00 AM", "last_run": "ISO|null",
          "last_result": "ok", "next_run": "ISO|null" }
      ]
    }
  ],
  "feed": [
    { "time": "ISO +05:30", "agent": "harish-pa", "text": "…",
      "kind": "trade|notice|report|journal|reminder|events|info|error" }
  ]
}
```

Layout rules:
- The desk that holds `harish-pa` (id `hub`) is the centre island.
- Desks with id `studio`, or with "Solo" in their name, become a ring of single stations.
- All other desks are hex clusters arranged around the hub.
- If an agent references an unknown desk, the map creates a fallback desk for it.
- If the agent list changes, only the desk and robot layer is rebuilt.

The UI shows an `idle` agent as `scheduled` when its `next_run` is within 30 minutes. Times are shown in IST, for example `2:42 PM IST` for today or `Thu 9 Oct, 2:30 PM IST` for other days.

## Updating status: `tools/update_status.py`

The updater uses only the Python 3 standard library.

```bash
python3 tools/update_status.py --input tools/sample_input.json --output status.json [--base status.json] [--max-feed 200]
```

- It loads `--base` (default `./status.json`) if that file exists. Otherwise it starts from an empty skeleton.
- It applies the input file, then writes `--output` atomically.
- It sets `generated_at` to the current IST time (`+05:30`), unless the input provides `generated_at`.
- On bad input it exits with code 2 and a clear message. Examples of bad input: an unknown status or kind, an unknown agent, a malformed time, or unknown fields.

### Input format

```jsonc
{
  "generated_at": "2026-10-08T15:10:00+05:30",       // optional
  "agents": [                                         // upsert by id; merges only the given fields
    { "id": "crypto-chart-watch", "status": "working",
      "last_action": "…", "last_run": "…", "next_run": "…",
      "role": "…", "name": "…", "desk": "…" }         // a new agent needs name + desk
  ],
  "routines": [                                       // upsert by (agent, name)
    { "agent": "harish-pa", "name": "…", "schedule": "…",
      "last_run": "…", "last_result": "…", "next_run": "…" }
  ],
  "feed": [                                           // appended, de-duplicated by (time, agent, text)
    { "time": "…", "agent": "…", "text": "…", "kind": "info" }
  ],
  "replace_feed": false                               // true discards the existing feed first
}
```

After merging, the feed is sorted newest first and capped at `--max-feed` entries (default 200). An `idle` agent whose next run is close stays `idle` in the file, and the UI shows it as "scheduled". See `tools/sample_input.json` for a working example.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000/
```

You need an HTTP server because the page loads ES modules and fetches `status.json`, which does not work from `file://`.
