# Hero demo film: design

## Why
The landing page video is the first thing a signed-out visitor sees. It should show the full range of the app in the polish of an Apple product film, so a student understands in about 30 seconds what the notebook does for them.

## Goals
- About 30 s, 60 fps in both MP4 (H.264) and WebM (VP8), 1920x1080 output, captured at 2x (2560x1440) and scaled down.
- Text stays sharp in every frame, including zoomed shots (target about 1.3 Mbps).
- Six chapters of 5 s each, matched by six pills under the video:
  1. 0 s, 1-Click Job Clipper: paste a Greenhouse link, fields cascade in, save (10 to 11 active).
  2. 5 s, Pipeline Board: drag Stripe from Applied to Interview, filter by Python.
  3. 10 s, Interview Prep and Mock: mark a question practiced, mock score counts up to 88/100.
  4. 15 s, Internship Openings: Today's openings feed, filter by term, save one with one click.
  5. 20 s, Deadlines and Calendar: Deadline Radar, export the .ics with 24 h / 2 h reminders.
  6. 25 s, Insights: funnel and skill bars animate, then a dissolve back to the exact opening frame so the loop is invisible.
- The camera keeps the window framed: no cut-off text or toasts, no large empty areas, zoom between 1.0x and about 1.4x.
- Demo data agrees everywhere (counts, weekday ring, priorities, filter counts).

## Non-goals
- No change to the real app beyond the landing page video block.
- No third-party runtime code; recording tools stay dev-only.

## Anti-goals
- Blurry or blocky text, missing borders from over-compression.
- A camera that slices the window or shows mostly backdrop.
- A visible jump when the video loops.

## Constraints
- Playwright's bundled ffmpeg only decodes MJPEG from image2pipe and encodes VP8 and PNG; MP4 goes through macOS AVAssetWriter.
- welcome.spec.js asserts the WebM source type `video/webm; codecs="vp8"` and the poster in the viewport background.
- Frames are streamed to disk, never all held in memory.
- The service worker cache is bumped for the page changes.

## Approaches considered
- Rebuild from scratch: wasted time; the draft's stage, springs and cursor work are sound.
- Keep the 3 MB total page budget: forces about 0.5 Mbps or 30 fps, which is the blurriness we are fixing.
- Chosen: keep Antigravity's draft and fix it, and load the video after the page has loaded. The page-weight test measures the page load against 3 MB, and a separate check caps each video file at 5 MB.

## Decided by the owner
- Approach above, about 30 s, the six-chapter storyboard, using Codex and Antigravity where they fit best.

## Left to the builder
- Exact camera keyframes, easing values, and the content of the openings and calendar scenes within the storyboard.
- How the six pills lay out (two rows of three on desktop, one column on phones).

## Revision (2026-11-27): kinetic explainer style
The owner chose a Zelios-style animated explainer (reference: YouTube wwIt5ZvROrs) over the continuous screen recording. Decided:
- Keep 6 chapters at 0, 5, 10, 15, 20, 25 s (about 30 s), so the pills and app.js stay as they are.
- Keep the 5 MB cap per file, 60 fps, 1920x1080, 2x capture, VP8 WebM and faststart H.264 MP4.
- Dark and light studio canvases alternate per chapter; 3D-tilted window shots alternate with oversized isolated UI pieces; kinetic headline typography with two-tone keywords; whip-pan cuts with short blur; corner-bracket scan for autofill (instant link parsing, no AI wording); SVG ring and checkmark confirmations; large outlined cursor; hook at the start and a "Stay in control." lockup at the end, dissolving back to frame 0.
- The continuous-camera version stays on branch hero-film-recorder (commit f24df6e plus its footage) as a fallback.
