# MIND Demo Runbook

Canonical local demo path for MIND on machines where Ollama needs the CPU-safe Metal workaround.

This runbook is the release gate for demo-ready checks. If any step fails, stop and fix it before presenting.

## 1) Prerequisites

- Ollama installed on the machine.
- `gemma2:2b` pulled into the local Ollama instance.
- The MIND app built successfully.

Commands:

```bash
npm run ollama:pull:gemma
npm run build
```

## 2) Start Local AI

Start Ollama with the CPU-safe Metal workaround on the dedicated local host:

```bash
npm run ollama:serve:cpu-safe
```

Use this only as a local runtime workaround. It does not change MIND prompts, contracts, or product behavior.

## 3) Verify Runtime

Run the runtime checks against the dedicated host:

```bash
npm run runtime:ollama:check:gemma
npm run runtime:ollama:check:cpu-safe
npm run smoke:ai-routes:gemma
```

Expected result:

- `runtime:ollama:check:gemma` verifies `gemma2:2b` on `http://127.0.0.1:11437`
- `smoke:ai-routes:gemma` returns `200` for:
  - `/api/ai/intake`
  - `/api/ai/action`
  - `/api/ai/reentry`
- Each route reports `meta.model = gemma2:2b`

## 4) Start the App

After the build is ready, start the app:

```bash
npm run start -- --hostname 127.0.0.1 --port 3000
```

If you want a different port, keep it consistent across the browser check and the app URL you share.

`npm run dev` and `npm run start` now point at the canonical local demo path. Use `npm run dev:raw` or `npm run start:raw` only as manual escape hatches.

## 5) Demo Flow

Use one room and one task. Do not switch to generic chat-style narration.

Recommended flow:

1. Open a room that already has a saved reentry state.
2. Show the reentry card.
3. Read the `last-known-good` brief aloud.
4. Point to the 1-3 next moves in the card.
5. Click `ต่อจากจุดนี้` and confirm the room can move forward without rereading the whole context.
6. Treat `ย่อยให้เล็กลง` as secondary proof only when the room already has live scaffold or action state.
7. If you refresh the room, the last-known-good card should still be visible immediately.

What to say:

- "This room is usable even before AI refresh finishes."
- "The product starts from the last known good save point."
- "Gemma is the fallback that keeps the loop alive."

## 6) Browser Checklist

Run this once before every demo or release:

- App opens without an error splash.
- Health rail shows the active local model state, not a generic failure.
- Room sidebar and reentry card agree on `fresh / stale / fallback` state.
- A room opens with a visible reentry card before any refresh completes.
- The card shows at least one usable next move.
- `ต่อจากจุดนี้` is enabled for save-point rooms with a suggested reentry action.
- The room remains usable while AI refresh is in progress.
- Switching away and back keeps the same room context and last-known-good brief.

Automated browser check:

```bash
npm run smoke:demo-browser
```

## 7) Release Gate

Use `npm run gate:phase5` as the canonical pre-demo/release gate. The gate runs the checks below; if you want to inspect them manually, run them in the same order.

Treat the demo as green only if all of the following pass:

- `npm run runtime:ollama:check:gemma`
- `npm test`
- `npm run build`
- `npm run smoke:ai-routes:gemma`
- `npm run smoke:demo-browser`
- Browser checklist above

`npm run ollama:serve:cpu-safe` is the local startup step when you need to bring up the CPU-safe Ollama host manually; `gate:phase5` will auto-start it if needed.

If any of these fail, do not present the demo as stable.
