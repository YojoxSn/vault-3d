<div align="center">

# VAULT·3D

**Your Obsidian second brain as a 3D hologram, controlled with your bare hands.**

[![Live demo](https://img.shields.io/badge/▶_live_demo-try_it_now-00e5ff?style=for-the-badge)](https://YojoxSn.github.io/vault-3d/)

![License: MIT](https://img.shields.io/badge/license-MIT-blue)
![100% local](https://img.shields.io/badge/privacy-100%25_local-brightgreen)
![Three.js](https://img.shields.io/badge/Three.js-WebGL-black)
![MediaPipe](https://img.shields.io/badge/MediaPipe-hand_tracking-orange)

<img src="docs/hero.png" alt="A vault of 200 notes as a glowing hologram orb: height is time, wedges are folders" width="860">

*Tony Stark's lab, but for your notes. No install: open the page, point your webcam at your hands.*

[Français](README.fr.md)

</div>

---

## Try it in 10 seconds

1. Open the **[live demo](https://YojoxSn.github.io/vault-3d/)** and click **Explore the demo**.
2. Press **H**, allow the camera, hold up your hand (good light, 40–80 cm from the camera).
3. Or **drop your own vault folder** on the page. Your notes are parsed inside your browser tab and **never uploaded**.

## Build it yourself with one prompt

This project started as **a prompt pasted into [Claude Code](https://claude.com/claude-code)**. You write this, you get this.

**1. Paste this prompt** into Claude Code, started in an empty folder (short English version; the complete original French prompt is in [docs/PROMPTS.md](docs/PROMPTS.md)):

<details>
<summary><b>Show the prompt</b></summary>

```text
Create an interactive 3D visualization of ALL my Obsidian vault with Three.js,
controllable with my hands through the webcam, like Tony Stark's hologram in Iron Man.

Context
- My vault is here: <PATH/TO/MY/VAULT>   (name: <NAME>)
- Local web app: Vite + TypeScript + Three.js (no heavy framework), started with `npm run dev`.

Step 1 - Import the vault: a Node script walks the vault (ignore .obsidian/, .trash/),
parses [[wikilinks]], [[Note|alias]], [text](Note.md), #tags and YAML frontmatter tags,
resolves links like Obsidian does; links to missing notes become "ghost" nodes.
The vault stays READ-ONLY. Live mode with chokidar.

Step 2 - 3D scene: one glowing sphere per note (size = connections, color = root folder),
glowing links with particles flowing along them, d3-force-3d layout, bloom, fog, stars,
scanlines. InstancedMesh: it must stay smooth with 3000+ notes.

Step 3 - Hand control (MediaPipe Tasks Vision): a floating camera window with a neon skeleton.
Open hand = rotate, pinch = grab / click, two-hand pinch = zoom, pointing = 3D cursor,
fist = freeze the rotation, swipe = previous / next linked note, two palms = recenter.
Smooth the hands (One Euro filter). Everything must also work with mouse and keyboard.
The video never leaves the browser.

Step 4 - Side panel with the full note, search ( / ), filters, "Open in Obsidian" button.
Step 5 - HUD, color legend, modular code, tests for gesture recognition with simulated points.
At the end, give me the exact commands to install and run it.
```

</details>

**2. Get this result:**

<img src="docs/demo.gif" alt="Animated demo: the orb turns, zooms in, a note lights up with its neighbours and its panel opens" width="860">

*Captured from the [live demo](https://YojoxSn.github.io/vault-3d/) with mouse and keyboard. A clip of the hand control itself is coming.*

**Honest notes**
- The prompt gives you a **working first version**. This repository goes further: Orb mode, a public demo vault, drag-and-drop loading, tests and one-click deployment.
- An AI writes the code, so **two runs will not give the exact same result**. Expect the same idea, not the same files.
- Hand-tracking thresholds depend on your webcam and lighting, so you may need a round of tuning: tell Claude Code what feels wrong.
- The whole method, the problems met and the second prompt: [How it was made](docs/HOW-IT-WAS-MADE.md).

## Hand gestures

| Gesture | Effect |
|---|---|
| ✋ Open hand, moving | Rotate the brain, it follows your palm |
| 🤏 Quick pinch on a sphere | Fly to the note and open it |
| 🤏 Pinch, hold and move | Grab and spin |
| 🤏🤏 Two hands pinched, spread or bring together | Zoom in / out, like Tony Stark |
| ☝️ Pointing | A glowing 3D cursor lights up the note and its neighbours |
| ✊ Fist, held 0.6 s | Freeze / resume the auto-rotation |
| 👋 Fast swipe left / right | Previous / next linked note |
| 🙌 Both palms toward the camera, 0.6 s | Recenter the view |

Everything also works with mouse and keyboard.

<img src="docs/note-panel.png" alt="Note panel with outgoing and incoming links, neighbours lit up" width="860">

<img src="docs/graph-mode.png" alt="Free-form network mode (press O)" width="860">

*Same vault in free-form network mode (`O`).*

## Features

- **Orb mode** (default): your notes on a glass globe. **Height = time** (newest at the north pole), **wedge = folder**, well-connected notes sink toward the glowing crystal core. Press `O` to switch to the free-form network.
- **One sphere per note**: size = number of connections, colour = root folder. Notes that are linked but do not exist yet appear as **wireframe ghosts**.
- **Glowing links with flowing particles** showing link direction, bloom, fog, star field, scanlines and grain (toggle with `G`).
- **Full note content** in the side panel (Markdown rendered and sanitised), with clickable incoming / outgoing links, tags, dates and word count.
- **Search** titles *and* content (`/`), filter by folder and tag, hide orphans or ghosts.
- **"Open in Obsidian"** button (`obsidian://` deep link).
- **Brain shape** (`B`): two hemispheres, balanced by folder.
- **Built for big vaults**: instanced meshes, one geometry for all links, layout computed in a Web Worker. Measured on a synthetic vault of 2,000 notes and 16,000 links: 0.2 s to parse, about 5 s to lay out while the UI stays responsive.
- **Read-only**: it never writes to your vault.

| Key | Action |
|---|---|
| `/` | Search |
| `R` | Recenter |
| `Space` | Pause the auto-rotation |
| `O` | Orb mode / free-form network |
| `B` | Brain shape |
| `G` | Hologram effect |
| `H` | Hands mode |
| `← →` | Previous / next linked note |
| `M` | Hide / show the menu |
| `Esc` | Close panel / search |

## Run it locally

```bash
git clone https://github.com/YojoxSn/vault-3d.git
cd vault-3d
npm install
npm run dev          # http://localhost:5173 — demo, or drop a folder on the page
```

### Load your vault automatically in dev

```bash
cp .env.example .env        # then set VAULT_PATH=/path/to/your/vault
npm run dev                 # regenerates the graph from your vault at every start
npm run dev:live            # also watches the vault and reloads on changes
```

`.env`, `public/graph.json` and `public/content.json` (which contain your note text) are git-ignored.
Other useful commands:

```bash
npm run build:graph -- "/path/to/vault"   # generate public/graph.json only
npm test                                  # parser + gesture tests (no camera needed)
npm run build                             # production build in dist/
```

## Deploy your own demo (GitHub Pages)

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Push to `main`. The workflow in `.github/workflows/pages.yml` runs the tests, builds, and publishes.

## How it works

```
src/parser   Markdown → graph: wikilinks (aliases, headings, paths), md links, tags, YAML frontmatter,
             Obsidian-style name resolution, ghost notes. Pure functions: same code in browser and CLI.
src/scene    Three.js: InstancedMesh spheres (custom shader: fresnel rim, pulse, fog), one LineSegments for
             all links, GPU-animated particles, UnrealBloom + hologram pass. d3-force-3d runs in a Worker.
src/hands    MediaPipe HandLandmarker → One Euro filter → pure gesture recognition → state machine
             (debounce, hysteresis, click vs grab, two-hand zoom, swipe, fist-hold, palms).
src/ui       Panel, search, filters, landing page, draggable camera window.
```

Hand tracking runs **on-device** in your browser (WASM + a 7.8 MB model shipped in `public/models/`). The webcam stream is never recorded or sent anywhere.

## Status and honest limits

- The gesture logic is covered by unit tests on **simulated hands**, and the full pipeline (camera → model → engine) runs in a real browser. **Thresholds still need tuning on more real webcams and lighting**: if a gesture feels off, open an issue with your setup. Constants live in `src/hands/engine.ts` (`CFG`) and `src/hands/gestures.ts`.
- If "both palms" fires when you show the *backs* of your hands, set `PALM_FLIP = true` in `src/hands/gestures.ts`.
- The frame rate on a real GPU with 2,000+ notes has not been benchmarked yet (parsing and layout have). Reports welcome.
- Needs a browser with WebGL2 and, for hands mode, camera access over HTTPS or `localhost`.
- Attachments (images, PDF) are ignored; only `.md` notes become nodes.
- "Brain shape" is an experiment: it works best with a large vault.

## How it was made

Built in conversation with [Claude Code](https://claude.com/claude-code) from two prompts, then packaged for everyone (demo vault, drag-and-drop, tests, Pages).

- 📝 **[The prompts](docs/PROMPTS.md)**: copy them, put your own vault path, get your own version.
- 🛠 **[How it was made](docs/HOW-IT-WAS-MADE.md)**: the method, the problems met, how to reproduce and publish your own copy.

<img src="docs/real-vault-hands.png" alt="First version of the project on a real 2,054-note vault, hands mode on" width="860">

*The first version on a real 2,054-note vault, hands mode on (folder names blurred).*

## Contributing

PRs and ideas welcome, see [CONTRIBUTING.md](CONTRIBUTING.md). Good first topics: gesture tuning on your webcam, Logseq support, better brain layout.

## Credits

[Three.js](https://threejs.org) · [MediaPipe Tasks Vision](https://developers.google.com/mediapipe) · [d3-force-3d](https://github.com/vasturiano/d3-force-3d) · [marked](https://marked.js.org) · [DOMPurify](https://github.com/cure53/DOMPurify) · Gesture smoothing: the [One Euro filter](https://gery.casiez.net/1euro/).
Not affiliated with Obsidian or Marvel.

## License

[MIT](LICENSE)
