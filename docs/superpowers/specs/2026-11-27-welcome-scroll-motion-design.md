# Welcome Page Scroll Motion Redesign

Date: 2026-11-27
Status: draft for owner approval
Page: the signed-out welcome page (`#landing-shell` in `src/main/resources/public/index.html`)

## Intent

The owner wants the welcome page to feel high end and to match the kinetic hero film: "the website moves instead of the scroll". Today the page has no motion of its own. Sections appear instantly, wheel scrolling is the browser default, and only nav-link clicks glide (`smoothScrollToSection` in `js/app.js`, 560 ms ease-in-out). The page should feel as smooth and deliberate as the film, so a visiting student trusts the product before signing up.

The owner chose two techniques together:

1. **Scenes that play as you scroll.** A feature section pins in place while the visitor scrolls, and its scene animates with scroll progress, then releases (Apple AirPods Pro and iPhone pages, Linear, Stripe, Attio).
2. **Momentum and depth.** Wheel and trackpad scrolling glides with inertia; layers move at slightly different speeds; headlines slide in (Locomotive, Lenis showcase).

## Goals

- Desktop wheel and trackpad scrolling glides with weighted momentum, with no lag ("swimming in honey") and identical feel at 60 Hz and 120 Hz.
- Each of the six feature sections becomes a pinned, scroll-scrubbed scene in the film's visual language.
- The hero keeps the playing film and gains entrance motion and a smooth hand-off into the first scene.
- 60 fps on a mid-range laptop (MacBook Air class) in Chromium and Safari.

## Non-goals

- The signed-in notebook app. Its motion stays as it is; the engine runs only while the welcome page shows.
- Changing feature copy, order, or the sign-up form's behavior.
- Replacing the visitor's own mouse cursor. The film's oversized cursor appears only as an actor inside scenes.
- A hands-on interactive demo. Scenes respond to scroll only (plus hover lift on cards).

## Anti-goals (failure even if it "works")

- Scroll that lags behind the wheel or overshoots.
- Broken keyboard scrolling (Space, Page Up/Down, Home/End, arrows), find-in-page, scrollbar dragging, browser zoom (Ctrl/Cmd + wheel), or the Back button.
- Motion sickness: big parallax, counter-moving text, full-screen live blur.
- Content hidden from screen readers or search engines inside canvas or images.
- Forced scrolling. The page never moves unless the visitor scrolls or clicks a link (the owner's "free page" rule).
- Any regression of the landing gating rules (signed-out visitors see the welcome page, signed-in visitors go straight to the notebook with no flash).

## Constraints

- Vanilla JS and CSS. No frameworks. Zero third-party scripts at runtime (enforced by `tests/e2e/welcome.spec.js`). Libraries such as Lenis or GSAP are not loaded; the engine is written in-house.
- Page weight under 3 MB excluding the film (existing test).
- WCAG 2.2 AA, both themes.
- `prefers-reduced-motion: reduce` removes glide, pins, parallax, and reveals. Scenes then render their finished state in normal page flow.
- CI runs Playwright on desktop Chromium and iPhone 13 WebKit; both must pass.
- Bump the service worker cache name (`sw.js`, currently `internship-notebook-v42`).

## Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| A. Scrub the film itself: pin a 16:9 stage and map scroll to film time | Exact match with the video and fastest, but a widescreen box on portrait phones, and its text is not real page content | Rejected |
| **B. New scroll scenes built from the page's own six feature sections, film keeps playing in the hero** | Responsive, accessible real text, most high-end; largest build; style kept in sync with the film by hand | **Chosen by the owner** |
| C. Momentum and depth only, no pinned scenes | Quick and low risk, but drops the scenes the owner asked for | Rejected |

Engine library options (Lenis, GSAP ScrollTrigger) were rejected because of the zero-third-party-scripts rule.

## Design

### 1. Scroll engine (Codex: `gpt-6.2-sol` builds, `gpt-6-astra` reviews and hardens)

New module `src/main/resources/public/js/motion/scroll-engine.js`.

- **Momentum on top of native scroll.** The document scrolls normally; the engine intercepts `wheel` events (non-passive), accumulates a target position, and each animation frame writes `window.scrollTo({ top, behavior: "instant" })`. No fixed wrapper, no fake scroll container, so find-in-page, anchors, and the scrollbar keep working.
- **Frame-rate-independent damping:** `current += (target - current) * (1 - exp(-lambda * dt))`, with `lambda` between 7 and 10 (start at 9, tune by feel). Wheel delta multiplier 1.0. Normalize `deltaMode` lines and pages to pixels.
- **Active only when all hold:** the welcome page is visible; a fine pointer with hover (`(pointer: fine) and (hover: hover)`); reduced motion is off. It turns off live when any of these change.
- **Hands off (native behavior) for:** touch input; Ctrl/Cmd + wheel (zoom); wheel events over an element that can scroll itself in that direction; horizontal-dominant wheel; while a modal or the auth success overlay is open.
- **Resync:** on any native `scroll` event where `scrollY` differs from the engine's last write by more than 1 px (scrollbar drag, keyboard, find-in-page, focus scroll), set target and current to `scrollY` and stop gliding.
- **Programmatic glide** `engine.scrollTo(targetY, { duration })` with expo-out easing, interrupted by any wheel, key, or pointer input. Duration stays within the existing 400 to 800 ms clamp (`clampScrollDuration` in `landing.js` and its unit test, from the earlier landing spec); only the easing curve changes (Claude's call). `smoothScrollToSection` in `js/app.js` delegates to it and keeps its header offset. Focus behavior stays as today: Overview and Features links move focus to the section heading, and Create Account and Sign In keep focusing the form's first field (`#signup-name`, asserted in `welcome.spec.js`).
- **Idle sleep:** the frame loop stops when `|target - current| < 0.5 px` and no scene needs a frame.
- The CSS rule `html:has(#landing-shell:not([hidden])) { scroll-behavior: smooth; }` is removed while the engine is active, because CSS smooth scrolling would fight the engine's per-frame writes.
- No `history.pushState` on scroll. `history.scrollRestoration` stays native.

### 2. Scene system

New module `src/main/resources/public/js/motion/scenes.js`.

- Each scene is a tall wrapper (`data-scene`, height set by CSS variable `--scene-length`) containing a `position: sticky; top: 0; height: 100svh` stage.
- Geometry (wrapper top and height, viewport height) is cached on load and in a `ResizeObserver`; nothing calls `getBoundingClientRect()` inside the frame loop.
- Each frame, active scenes get `progress = clamp((scrollY - start) / (length - viewportHeight), 0, 1)`, written to `--p` on the stage and passed to that scene's `update(progress)`.
- Scrubbed motion maps linearly to progress (the engine supplies the smoothness). Sub-beats use local ranges, for example `range(p, 0.2, 0.5)`.
- `IntersectionObserver` marks scenes active within one viewport of view; only active scenes update, and only they get `will-change: transform`.
- Only `transform` and `opacity` animate per frame. No per-frame `filter: blur()`, `box-shadow`, width, or top.
- **One-shot reveals** (`data-reveal`): headlines rise by line from a mask (`translateY(105%)` to 0, 700 ms, `cubic-bezier(0.16, 1, 0.3, 1)`, 70 ms stagger per line, up to 3 degrees initial skew); badges and buttons fade up 12 px. They trigger once on entering view.
- **Depth** (`data-depth`): background accents move at 0.3 to 0.6 times scroll speed, floating cards at 1.12 to 1.25. Body text always at 1.0. Parallax travel capped at 60 px.

### 3. Scenes (Neon and Claude design; Neon reviews frames)

Shared language from the film: alternating light and dark studio canvases with a static film-grain layer (no animated noise), two-tone headlines with terracotta keywords, 3D-tilted UI cards that flatten as they reach focus, emerald progress rings, and the oversized outlined cursor as an in-scene actor. Copy column holds the existing feature badge, title, description, and annotation list as real DOM; the stage column holds the animated visual, built from the existing `feature-visual` screen mocks. Copy and stage keep today's alternating sides.

| # | Feature (`data-feature-id`) | Canvas | Desktop pin | Choreography |
|---|---|---|---|---|
| 1 | `clipper` | light | 200vh | A tilted job posting sits in a browser card. 0 to 0.5: the cursor glides in and clicks a terracotta "Clip" pill. 0.5 to 1: role fields lift off the page into a notebook card, and an emerald ring closes. |
| 2 | `pipeline` | dark | 240vh | Enters with a quick horizontal slide (the film's whip cut, faked with a 180 ms slide and a faint ghost, no live blur). A tilted board with Applied, Interview and Offer columns flattens. The cursor picks up a card, carries it to Interview, and the column count increments. |
| 3 | `import` | light | 180vh | Spreadsheet rows (CSV look) slide in, each row folds into an index card, and the cards stack into the notebook. A counter ticks to the imported total. |
| 4 | `interview` | dark | 220vh | A question card holds still while a mock-interview timer card slides forward in depth. An emerald readiness ring fills with progress, and STAR notes unmask line by line. |
| 5 | `reminders` | light | 200vh | A calendar tilts upright to flat. Terracotta deadline pins drop in with 45 ms staggers, a playhead sweeps the week, and the next deadline card lifts forward. |
| 6 | `insights` | dark | 200vh | Three emerald rings draw to their values in sync with scroll, metric cards rise at depths 1.08 and 1.18, and from 0.85 to 1 they compress upward to hand off to the sign-up section. |

**Theme (owner's decision):** in the light theme, scenes alternate light and dark canvases as in the table, like the film. In the dark theme (`:root[data-theme="dark"]`), the light canvases switch to a second, lighter-but-still-dark shade, so the visitor never gets a bright flash; the dark canvases stay as they are. Every canvas meets WCAG AA in both themes. Screenshot review covers both themes.

Total desktop pin length about 1240vh. Every 10 percent of a scene's progress must visibly change something (no dead zones).

### 4. Hero, header, sign-up

- **Hero:** the film keeps its current behavior (starts on `load`, chapter pills, no autoplay attribute, `preload="none"`). On load, the headline reveals by line with the terracotta keyword treatment. While scrolling out, the film card scales from 1 to 0.94 and the copy drifts at depth 1.0 to 0.9 so the hand-off to scene 1 feels continuous.
- **Header:** at the very top it is clear (no background or blur) over the hero; after 24 px of scroll it gains today's translucent blurred background (static `backdrop-filter`, toggled once by a class, not animated per frame). Claude's call.
- **Sign-up and footer:** not pinned. Reveals only.

### 5. Responsive and fallback behavior

- **Touch devices and coarse pointers:** native scrolling (no glide). Scenes still pin and scrub from native `scrollY`. Pin lengths are 25 percent shorter.
- **Pin only when it fits (Claude's call, for WCAG reflow and resize):** after layout, the scene system measures each stage's content against the space under the sticky header. A scene whose copy and visual do not fit (small phones, 200 percent zoom, large text settings) is not pinned: it uses normal page flow with one-shot reveals and plays its scene once as it enters view. This is rechecked on resize and zoom. The sticky stage sits below the header (`top` equals the header height).
- **Below 768 px width:** each stage stacks copy above a shorter visual. All copy, including the annotation list, stays visible; nothing is visually hidden to make a pin fit, and the fit rule above decides whether a scene pins.
- **Reduced motion:** no engine, no pins (`--scene-length: auto`, stage `position: static`), no parallax or reveals. Each scene shows its final frame.
- **No JavaScript or a script error:** the page renders as today's static layout (scenes are progressive enhancement; CSS pin styles apply only under a `.motion-ready` class the scene system adds).

### 6. Quality and verification

- Unit tests (Node test runner) for the engine math: damping convergence at 60 and 120 Hz giving the same position after the same elapsed time, delta normalization, resync, clamp and range helpers, and progress mapping.
- Playwright (desktop Chromium and iPhone WebKit):
  - Wheel input on desktop glides: `scrollY` keeps increasing for several frames after one wheel event and settles.
  - Page Down, Space, End, and Home still move the page; Ctrl + wheel is not intercepted.
  - Nav links land each section under the header and move focus to its heading.
  - Each scene's `--p` goes from 0 to 1 across its wrapper.
  - Touch emulation (iPhone project) uses native scroll and still scrubs scenes.
  - Reduced motion: no pinned stages, all scene content visible.
  - No horizontal overflow at 320, 768, 1024, and 1440 px; no console errors; gating and no-flash tests still pass; page weight under 3 MB.
- A test hook `window.__motion` (only on the welcome page) exposes `setProgress(sceneId, p)` and `settle()` so screenshots are deterministic.
- Visual review: Neon reviews screenshots of every scene at progress 0, 0.5, and 1 in desktop light and dark sections and on a phone viewport; Claude fixes every verified defect.
- Performance check: a Chromium performance trace of a full wheel scroll shows no long tasks over 50 ms and no layout inside the frame loop.

## Agent roles

| Agent | Role |
|---|---|
| Codex `gpt-6.2-sol` | Builds the scroll engine and the scene system with unit tests. |
| Codex `gpt-6-astra` | Reviews Sol's engine adversarially (edge cases above), hardens it, and writes missing tests. Takes over if Sol stalls. |
| Antigravity Gemini 4 Neon | Reference research (done), scene visual design with Claude, and screenshot review. |
| Claude | Scene markup and CSS, page integration, Playwright tests, verification, and final review. |

## Left to the builder

- Exact visual details inside each scene, within the choreography above.
- The final damping value between 7 and 10, tuned by feel.
- How the existing screen mocks are restructured into stage elements.
- File splitting within `js/motion/`, and whether scene update functions live in one file or one per scene.

## Reference research

Neon's report (2026-11-27) informed the numbers above: damping and pin lengths from the Lenis baseline and Apple pages, linear scrubbing, expo-out reveals, depth ratios, accessibility handling, and the choreography starting points.
