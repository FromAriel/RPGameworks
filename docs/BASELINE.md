# M1.6 — Foundation baseline and closeout

**Scope:** the existing skinned Workshop/Gallery experience. This packet adds reproducible measurements and acceptance evidence, not inventory, saves, conditional doors, a theme redesign, or a new runtime profiler.

## Run the same workload

Use the repository's supported Node version and committed lockfile. In a normal checkout, run `npm ci --include=dev` for a fresh install, `npx playwright install --with-deps chromium` once to install the test browser, and `npm run benchmark` to measure. Existing installations with the pinned browser/dependencies already available need no reinstall. Git must be available: a report identifies its actual commit, tree, dirty-worktree flag, lockfile hash and runtime fingerprint. An exported ZIP without `.git` is not a provenance-bearing benchmark checkout.

The command builds a production application under `/RPGameworks/`, starts its own static preview on port 4173, runs one browser worker, writes results, and shuts the preview down. It refuses an occupied port instead of connecting to an unidentified old server. The ordinary development port remains 5173. Stop unrelated workloads when comparing a real machine; do not combine a result from an idle machine with one under unrelated CPU/GPU load.

Results go to ignored `benchmark-results/` (raw workload JSON and door checkpoints) and `benchmark-report/results.json` (Playwright outcomes). `workloadCompleted` means the input sequence completed; use the Playwright outcome too, because later resource/correctness assertions can still fail. CI uploads `baseline-evidence-<label>` with 14-day retention. Durable selected-run summaries live in [the benchmark record](benchmarks/M1-2026-09-18.json); a historical artifact may expire while that summary remains.

No profiler code, recurring callbacks, counters, menu buttons or data uploads are added to normal play. Instrumentation is injected only into benchmark/test pages. Game source, artwork, content and the lockfile are unchanged by this packet. Existing hidden-by-default Debug remains unchanged.

## Workload definition: m1-baseline-v1

All workloads use a 1500 × 760 CSS-pixel viewport, device pixel ratio 1, and the existing 320 × 192 logical canvas displayed at 960 × 576. Opening the 360-pixel Debug drawer still leaves the same 3x game scale; assertions check this before sampling. This removes game-size changes from the Debug comparison, not the cost of Debug itself.

A 1.5-second warmup follows setup. Settings is opened through the real UI to establish the effects choice, then closed where appropriate. The atlas may remain cached after setup. These are warmed steady-state measurements, not cold-start timings. Each of the seven steady workloads lasts at least 10 seconds; the report records actual elapsed time including automation overhead.

| Workload | Input / surface | Effects | Debug |
| --- | --- | --- | --- |
| workshop-idle | Standing in Workshop | Off | Closed |
| gallery-idle | Standing in larger Gallery | Off | Closed |
| walk-effects-off | Ten alternating 1-second left/right holds; 40 Space presses | Off | Closed |
| walk-effects-on | Same keyboard sequence | On | Closed |
| walk-effects-debug | Same keyboard sequence and game scale | On | Open, stage focused |
| mara-message | Real caretaker message remains open | On, no burst input | Closed |
| settings-idle | Real Settings and section divider remain open | On, no burst input | Closed |
| door-tour | Warm conversation, then 20 round trips / 40 real crossings; one burst before each crossing | On | Closed |

Input is ordinary Playwright keyboard/pointer input. There are no teleports, direct engine actions, altered clocks, fake frame delays or route replacements in these workloads. The existing cosmetic particle random ranges are not seeded, so this is not a pixel-identical random replay. The controls/failure tests separately retain synthetic Gamepad API fixtures; neither path certifies physical Elite hardware.

## What the numbers mean

**Frame pacing** is the interval between the benchmark's `requestAnimationFrame` callback timestamps. The report provides count, mean, nearest-rank p50/p95/p99, maximum, and counts above 33.334 and 50 ms. Every observed interval is retained, including stalls. It is never clamped to the movement system's 50 ms catch-up limit. `meanCallbackHz` is 1000 divided by the mean interval, not a claim of frames physically presented to a monitor. The runtime's existing rounded FPS reading is reported separately.

**Resource observations** are read-only runtime snapshots, DOM element counts and per-surface skin-paint counters, normally sampled at approximately 4 Hz. The tour additionally reads runtime state each callback to observe transfer completion. Sampled maxima are not exact synchronous peaks: two views can briefly coexist inside one transition task without being visible to the sampler. Resource counts are not heap/GPU-memory measurements and cannot establish the absence of every leak. No extra always-on runtime ownership layer was created for this closeout.

**Travel timing** starts at the destination map's Resource Timing `startTime` and ends at the first animation-frame observation of the new map with exploration input restored. It includes network/revalidation, decoding, validation, view preparation and up to an observation interval of scheduling delay. It excludes walking to the threshold. The existing loader uses `cache: 'no-cache'`, so repeat visits can still revalidate: the report does not describe them as guaranteed RAM-only cache hits. All 40 observations are retained; a second aggregate excludes the first visit in each direction. This metric is not an exact instrumented transition-token duration.

**Long-task observations**, where the browser supports them, count delivered entries and their total/maximum durations inside the capture. They are not the total CPU time of the game. Zero observed long tasks does not prove an 8 ms CPU budget. The observer itself, runtime snapshots and driver activity impose measurement overhead; all comparisons retain that overhead.

**Unavailable metrics** are explicit nulls: game CPU work, GPU time, heap bytes, total GPU memory and exact listener counts. This packet does not assert the master plan's 8 ms CPU budget, 64 MiB graphics budget, throttled cold-start goal, exact 300 ms transition target, or a long-session memory plateau. Those need their specific instrumentation/environments and later lifecycle/device work.

Captures have fixed bounds (30,000 frame intervals, 1,024 snapshots, 256 transfer observations, 120-second watchdog) and explicit start/stop ownership. Duplicate captures are refused; cleanup removes observers/listeners and cancels pending work. Hidden/blur contamination, buffer overflow, watchdog termination, missing observations and incorrect gameplay/resource states fail acceptance. No absolute FPS threshold is enforced on shared CI hardware. Empty data is unavailable, never silently converted to a healthy zero.

## Acceptance consolidated

| M1 requirement | Evidence exercised by the suite |
| --- | --- |
| Production base path and lazy maps | `foundation.spec.ts`, `maps.spec.ts`: real production preview under `/RPGameworks/`, payload requests, named spawns and invalid content. |
| Movement, collision and timing | Domain movement/interaction tests include bounded catch-up and simulated 30/60/120/144 Hz door arrival; browser tests check actual movement and collision. Simulated refresh rates are not physical high-refresh display tests. |
| Input ownership and hidden/resumed behavior | Existing controller, recovery, shell and interaction cases exercise release/rearm, modal priority, focus and hidden/blur events. |
| Repeatable doors and recovery | Existing interaction suite covers 40 transfers, cancellation, stale responses, timeout, missing/malformed destinations and Retry/Stay. The benchmark adds a timed 40-crossing tour with per-room checkpoints. |
| Cosmetic independence | Effects-off movement/dialogue/travel cases remain; the same 40 burst requests are admitted with particles off or on. |
| Pixel presentation and optional UI | Existing shell/skin tests check narrow, wide, odd-sized and 4K viewports, title fallback, literal long text and closed tools. Artwork is unchanged. |
| Bounded objects and static window dressing | Fixed-map object/texture counts, 64-particle ceiling, no repeated idle skin painting, no hidden Debug table mutations, and stable repeated-transfer counts are asserted. |
| Trustworthy measurement | Statistics tests preserve stalls/reject invalid data; three browser probe tests verify lifecycle, a deliberate stall, and hidden/blur contamination. |
| Static preview vs deployment | Hosted CI opens a real local production preview. No public site or hosting configuration is created. |

The pre-existing W1 suite had 207 unit tests and 78 browser scenarios. Nine statistics tests and three probe scenarios bring the functional suite to **216 unit tests / 81 browser scenarios**, plus **eight separate benchmark workloads**. Source checking includes the benchmark TypeScript. No old scenario or assertion is removed.

## Recorded evidence

The selected initial baseline is source **`26a7e827d4236716d50d2fad376a2e9eb4a230a5`**, [run 35397588184](https://github.com/FromAriel/RPGameworks/actions/runs/35397588184). All three jobs passed installation, source/content/build checks, **216 unit tests, 81 functional browser scenarios and all eight benchmark workloads**. Each benchmark report records eight expected, zero unexpected, zero flaky and zero skipped outcomes. This is candidate evidence; the clean delivery commit receives its own normal CI and has a different source identity even though gameplay files are unchanged.

All three captures used Headless Chrome 153.0.8010.12 with ANGLE/Vulkan **SwiftShader software rendering**. Linux runners reported four logical CPUs on AMD EPYC 7763 hosts; Windows reported four logical CPUs on an AMD EPYC 9V74 host. Those are runner-reported CPU descriptions, not dedicated physical machines owned by this project. Both Node 24 jobs used npm 11.6.2; the Node 22 leg used npm 10.9.2.

| Selected environment | Steady workload p95 callback-interval range | Largest callback interval across all eight workloads | 40-crossing fetch-to-observed-ready p95 | Tour elapsed |
| --- | ---: | ---: | ---: | ---: |
| linux-node22 | 16.7–16.8 ms | 16.8 ms | 16.2 ms | 16.66 s |
| linux-node24 | 16.7–16.8 ms | 16.8 ms | 16.2 ms | 16.62 s |
| windows-node24 | 16.7–16.8 ms | 16.8 ms | 16.7 ms | 16.53 s |

Every selected sample retained one active scene, one resident map and one counted Phaser texture. Workshop had 245 display objects, Gallery 342. These are display-list objects (including tile imagery), not counts of NPCs or all allocated browser objects. Particle maxima observed during walking were 46–48 with effects enabled and zero with effects disabled, within the existing 64 ceiling; those are sampled observations, not a new capacity limit. Every arrival checkpoint in the 40-crossing tour had zero outgoing live/pooled particles. The original room's object/texture counts were restored, with no scene recreation or browser document reload.

For the seven steady captures, each surface's skin-paint count was unchanged. Hidden Debug had zero observed table mutations; visible Debug recorded 41 mutation records in each environment without triggering border repaint. Mutation records are not a universal count of all DOM operations. No long-task entry or interval over 33.334 ms was observed in these specific captures. Similar callback pacing does not mean effects or Debug cost zero CPU/GPU time; a refresh-paced measurement can conceal headroom differences.

The report hashes actual checked-out bytes. Windows Git line-ending conversion produced a lockfile hash different from Linux: converting the canonical LF file to CRLF reproduces the Windows `89c9482e…` hash exactly. This is not a dependency change. Runtime fingerprints are also worktree-byte identities, not normalized cross-platform hashes; compare like environments and retain the commit/tree identity. The canonical Git lockfile and all gameplay/assets are unchanged by M1.6.

See [M1-2026-09-18.json](benchmarks/M1-2026-09-18.json) for selected-run environment, archive/report hashes, artifact IDs, individual distributions and all 40 travel durations per environment, and the current [STATUS](STATUS.md) for the exact tested source and CI record. The summaries preserve individual environments; results are not averaged across operating systems or different virtual machines. Original reports retain raw intervals, snapshots and all travel observations. A summary is not sufficient to recompute arbitrary new percentiles.

This is a foundation reference, not a capacity benchmark or device-support certification. The tiny maps and 64-particle effect do not establish the proposed large-map/PixelFX limits. Headless CI rendering is not Ariel's desktop GPU, a real phone, Safari or Firefox. A few ten-second samples and a short door tour do not establish long-session thermal or memory stability.

## Next packet

M2 starts with immutable definitions, authoritative session state, stable placed-object deltas and a one-shot chest/item transaction. N1 accompanies the first inventory menu. State initially survives room travel, not browser reload, until storage acceptance passes. Keep the approved skin and player shell; do not reopen controller detection or build a broad event language. G1 conditional access and M3 branching conversations remain later, as recorded in [NEXT-SLICES](NEXT-SLICES.md).

## Measurement references checked September 18, 2026

Primary documentation used for the measurement design: [W3C High Resolution Time](https://www.w3.org/TR/hr-time/) (monotonic clocks and possible precision reduction), [HTML animation frames](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#animation-frames) (callback timing), [W3C Resource Timing](https://www.w3.org/TR/resource-timing/) (resource start timestamps), [W3C Long Tasks](https://www.w3.org/TR/longtasks/) (delivered long-task observations), and [Playwright web-server configuration](https://playwright.dev/docs/test-webserver) (production preview ownership). These sources define API semantics, not RPGameworks' measured results. Their URLs were opened or retrieved during implementation.
