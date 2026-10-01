# AR MENU — zero-cost browser AR restaurant menu (POC)

Static-only demo: scan a QR → open the page → grant camera → point at the printed
`AR MENU` card → an AR menu pinned to the card appears → tap **Royal Burger** →
a smooth transition plays → a 3D burger appears above the card. Drag to spin,
pinch to zoom, **← Back to menu** to reset.

- Tracking: **MindAR** image tracking (free, no key)
- 3D: **Three.js** (free, CDN), dish is **procedurally generated** (zero download,
  instant, reliable — chosen over GLB for this MVP per the brief)
- Cost: **₹0** — static frontend, no backend, no DB, no auth, no analytics
- Deploy: **GitHub Pages** (HTTPS → camera works)

## Files

| Path | What |
|---|---|
| `index.html` | Page, overlays (start / scanning hint / toast / back button) |
| `css/style.css` | Mobile-first styles |
| `js/app.js` | MindAR + Three.js app (menu texture, raycast taps, tweens, burger) |
| `assets/target/card.png` | Printable tracking card (branding + QR + high-feature art) |
| `assets/target/targets.mind` | Compiled MindAR features for `card.png` |
| `tools/make-card.py` | Regenerates `card.png` with *your* Pages URL in the QR |
| `tools/compile.html` | Browser-local tool to rebuild `targets.mind` after the QR changes |
| `.github/workflows/deploy.yml` | GitHub Pages deploy on push to `main` |
| `.nojekyll` | Serve `assets/` as-is on Pages |

## Local development

Requires: Python 3 (for the server + card script), Node 18+ optional.

```bash
# 1. serve the folder (localhost is a secure context → camera works)
python -m http.server 3000
# or: npx --yes serve@14 . -l 3000

# 2. open on desktop (preview only, no camera target needed for UI check)
http://localhost:3000/

# 3. open on your phone on the same Wi-Fi (use your PC's LAN IP):
http://192.168.1.X:3000/
# NOTE: plain-LAN http is NOT a secure context on most phones → camera may be
# blocked. For full testing use the HTTPS GitHub Pages URL (below).
```

`package.json` scripts: `npm run dev` (serve), `npm run make-card`.

## Tracking target — create / use

1. Print `assets/target/card.png` at ~A5–A4, **full-bleed, no cropping**, matte paper.
   Keep it flat on a table in good (diffuse, glare-free) light.
2. The card already contains: `AR MENU` branding, a QR, and dense
   high-contrast speckle/line/triangle art for tracking features.
3. The compiled features live in `assets/target/targets.mind` and must
   **match `card.png` pixel-for-pixel**. If you regenerate the card, rebuild `.mind`.

## QR URL — generate

The QR on the card must open your deployed page.

```bash
# after you know your Pages URL, regenerate the card with it baked in:
python tools/make-card.py --url https://<USER>.github.io/<REPO>/ --out assets/target/card.png
pip install qrcode pillow   # only if the script complains about missing modules
```

Then rebuild `targets.mind` (QR pixels changed → features changed):

- **Easy (no install):** serve the repo locally, open `tools/compile.html`,
  drop the new `card.png` → Compile → Download → save as
  `assets/target/targets.mind`, commit & push. — *or* —
- Re-run the offline Node compiler used for this repo (needs the `mindc`
  scratch env with `mind-ar`; see commit history), output to
  `assets/target/targets.mind`.

`tools/compile.html` runs 100% locally in the browser (MindAR CPU kernels).

## GitHub Pages deployment

1. Create a **public** repo (e.g. `ar-menu`), push this folder to branch `main`.
2. GitHub → repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main` → the `Deploy to GitHub Pages` workflow publishes the repo root.
4. Your live URL: `https://<USER>.github.io/<REPO>/` (HTTPS ✅ camera OK).
5. Regenerate card + `.mind` for that exact URL (sections above), commit, push,
   **re-print the card**.
6. All asset paths are relative (`./assets/…`, `./js/…`, `./css/…`) so the
   project-subpath (`/<REPO>/`) works with no config.

## Mobile testing (acceptance test)

On a real phone (modern Android Chrome first):

1. ✅ Project builds — static, nothing to build; `python -m http.server` serves it.
2. ✅ Local site loads — open the Pages URL, `AR MENU` start screen appears.
3. ✅ Camera permission flow — tap **Start AR**, allow camera, live video fills screen.
4. ✅ Target recognized — point at the printed card; scanning hint hides.
5. ✅ AR menu appears — `AR MENU` panel with Royal Burger ₹249 + Farm Pizza ₹299.
6. ✅ Stays attached — move the phone; menu tracks the card (both are children
   of the same MindAR anchor).
7. ✅ Clickable — tap **Royal Burger** (raycast on the tracked panel).
8. ✅ Smooth transition — row highlights → menu recedes → burger scales/moves in
   (tweened, no hard cuts). Farm Pizza shows a “display-only” toast.
9. ✅ 3D appears — stylized burger on a plate floats just above the card.
10. ✅ Spatially associated — burger is parented to the card anchor; it follows
    the card as you move.
11. ✅ Reset — **← Back to menu** shrinks the burger and pops the menu back.
12. ✅ Pages HTTPS deployment — URL is `https://…`, camera permission granted.
13. ✅ Real phone — whole flow done on-device (print card or show `card.png`
    full-screen on a second screen for a quick check).

## Known limitations (MVP)

- Procedural low-poly burger instead of photorealistic GLB (speed/reliability
  trade-off; swap `buildBurger()` in `js/app.js` for a `GLTFLoader` + `.glb`
  if you want realism later).
- iOS Safari not tuned (works in principle via HTTPS; test on Android first).
- Low light / glare / bent prints degrade tracking (MindAR limitation).
- Card + `.mind` must stay in sync; changing the QR URL requires recompile +
  reprint (see above).
- CDN dependency (jsDelivr: three.js + MindAR) — needs internet on the phone.
- No multi-target, no persistence, no analytics — by design (static POC).
