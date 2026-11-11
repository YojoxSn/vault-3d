# Contributing

Thanks for helping! The project is small on purpose: Vite + TypeScript + Three.js, no UI framework.

```bash
git clone https://github.com/YojoxSn/vault-3d.git
cd vault-3d
npm install
npm run dev        # opens on the landing page: try the demo or drop a folder
npm test           # parser + gesture tests (synthetic hands, no camera needed)
npm run typecheck
```

## Where things live

| Folder | What |
|---|---|
| `src/parser/` | Markdown → graph (links, tags, ghosts). Pure functions, shared by the browser and the CLI |
| `src/scene/` | Three.js: instanced spheres, glowing links, flowing particles, bloom, hologram pass, layout worker |
| `src/hands/` | MediaPipe wrapper, One Euro filter, **pure** gesture recognition, gesture state machine |
| `src/ui/` | Panels, search, filters, landing, floating camera window |
| `scripts/` | CLI graph builder, demo vault generator |
| `tests/` | Vitest. Gestures are tested with simulated landmarks |

## Good first contributions

- A gesture that feels better (tune thresholds in `src/hands/engine.ts` → `CFG`, and `gestures.ts`)
- Support for Logseq / plain markdown folders with other link styles
- A better "brain" layout
- Testing on more webcams and lighting conditions: please share what worked in an issue

## Rules of thumb

- Gesture logic stays **pure** (no DOM, no MediaPipe) so it can be unit-tested.
- Anything that touches the user's notes stays **read-only and local**: nothing is uploaded, ever.
