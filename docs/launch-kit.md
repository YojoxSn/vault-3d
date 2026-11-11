# Launch kit

Optional: this file is for you, delete it before publishing if you prefer.
Nobody can promise a repo goes viral. What decides it is, in this order: **a 10-second video**, **a link that works without installing anything**, and **a clear one-line pitch**. This repo already has the second and third. The first is yours to film.

## 0. Before you post anything (30 min)

- [ ] Test hands mode on your real webcam, with your real vault. If a gesture is flaky, tune `CFG` in `src/hands/engine.ts` first: people judge the whole project on this.
- [ ] Push to GitHub, then **Settings → Pages → Source: GitHub Actions**. Wait for the green check, open the live demo, press `H`, check it works over HTTPS.
- [ ] Replace the placeholders: `node scripts/set-owner.mjs <your-github-user> <repo-name>` and commit.
- [ ] Repo settings (needs the GitHub CLI, or do it in the web UI):

```bash
gh repo edit --description "Your Obsidian second brain as a 3D hologram, controlled with your bare hands (webcam). 100% local." \
  --homepage "https://YojoxSn.github.io/vault-3d/" \
  --add-topic obsidian --add-topic obsidian-md --add-topic threejs --add-topic three-js --add-topic mediapipe \
  --add-topic hand-tracking --add-topic gesture-control --add-topic hand-gesture-recognition --add-topic computer-vision \
  --add-topic knowledge-graph --add-topic graph-visualization --add-topic 3d-visualization --add-topic second-brain \
  --add-topic pkm --add-topic webgl --add-topic typescript --add-topic vite --add-topic hologram --add-topic iron-man \
  --add-topic claude-code
```

- [ ] **Settings → General → Social preview → upload `public/social-preview.png`** (1280×640). This is the image shown when the link is shared.
- [ ] Create a release `v0.1.0` (Releases → Draft a new release).
- [ ] Make sure no personal note is in the repo: `git ls-files | grep -E "graph.json|content.json|\.env$"` must print nothing.

## 1. Film the hero video (the single most important asset)

10 to 15 seconds, no talking, screen recording of the **demo** (not your private vault) **with your hand visible in the corner window** and ideally a second shot of you with your hand in front of the screen.

Sequence that reads instantly:
1. The brain slowly turning.
2. Open hand: it rotates with your palm.
3. Two-hand pinch, spread: zoom into the network.
4. Point, then pinch on a sphere: camera flies in, note panel opens.

Record with QuickTime / OBS (1080p, 30 fps), then make a light GIF and an MP4:

```bash
ffmpeg -i demo.mov -vf "fps=15,scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 docs/demo.gif
ffmpeg -i demo.mov -vf "scale=1280:-2" -c:v libx264 -crf 24 -an demo.mp4
```

Put `docs/demo.gif` at the very top of `README.md` (above the screenshot). On X, LinkedIn and Reddit upload the **MP4 natively**, not a link.

## 2. Where and when

Best window: Tuesday to Thursday, 8–10 am US Eastern. Do not post everywhere at once; spread over 2–3 days and answer every comment in the first 2 hours.

| Where | Angle | Rules to respect |
|---|---|---|
| **Show HN** | Technical: hands + WebGL + local-only | Title starts with "Show HN:", link to the live demo, no marketing words, first comment from you explaining how it works |
| **r/ObsidianMD** | "I made my vault graph 3D and controllable by hand" | Read the sub rules on self-promotion; flair "Plugins / Tools" or showcase; video in the post |
| **r/threejs** | Shader / instancing / post-processing breakdown | Share the technical bits |
| **r/webdev, r/InternetIsBeautiful** | The demo link and the video | Follow each sub's self-promo rules |
| **Obsidian forum → Share & showcase** | Same as r/ObsidianMD | |
| **Obsidian Discord → #showcase** | Short + video | |
| **X / LinkedIn** | The video, one line, the link | Quote-post with a 3-tweet "how it works" thread |

## 3. Copy-paste posts

**Show HN**

> Show HN: Vault 3D – explore your Obsidian notes as a 3D hologram, controlled by hand
>
> Link: https://YojoxSn.github.io/vault-3d/
>
> First comment: I wanted to see my notes as a network I could grab. It parses a vault (wikilinks, aliases, tags, ghost notes), lays it out with d3-force-3d in a Web Worker, and renders it with Three.js (instanced spheres, one geometry for all links, GPU-animated particles, bloom). Hand tracking is MediaPipe running in the browser; gestures are a small pure state machine on top of a One Euro filter, unit-tested with synthetic landmarks. Everything is local: you can drop your vault folder on the page and nothing is uploaded. Webcam thresholds need tuning on more setups, so I'd love reports. Repo: https://github.com/YojoxSn/vault-3d

**Reddit (r/ObsidianMD)**

> **I turned my vault into a 3D hologram you can control with your hands (webcam, 100% local)**
>
> Open hand rotates it, pinch to open a note, two hands to zoom. Search, folder/tag filters, "open in Obsidian", full note panel. Try it in the browser without installing anything, or drop your vault folder on the page (notes are parsed locally, nothing leaves your machine): https://YojoxSn.github.io/vault-3d/
> Source (MIT): https://github.com/YojoxSn/vault-3d
> Feedback on gestures very welcome, it's tuned on my webcam only for now.

**X / LinkedIn**

> I built a 3D hologram of my Obsidian vault that I control with my bare hands.
> Webcam hand tracking, runs 100% in the browser, nothing uploaded.
> Try the demo (no install) 👇
> https://YojoxSn.github.io/vault-3d/

**r/threejs**

> **Rendering a 2,000-note knowledge graph: instanced spheres + one LineSegments + GPU particles**
> Custom shaders for fresnel rim/pulse/fog, UnrealBloom + a small hologram pass (scanlines, chromatic aberration, grain), layout in a Worker. Demo + source: …

## 4. After posting

- Reply to every comment fast; ask commenters which webcam / lighting they used and turn the answers into issues.
- Label a few issues `good first issue` (gesture tuning, Logseq import, layout) so visitors become contributors.
- Pin the repo on your profile and add the demo URL to the repo "About" box.
- If it takes off: cut a release quickly, and keep the README top clean (video, demo link, one-line install).
