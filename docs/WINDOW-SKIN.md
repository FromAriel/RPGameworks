# Window skin — W1 implementation and atlas format

**September 18, 2026. W1 is implemented; M1.6 performance closeout remains next.**

Mara's actual conversation window, the Settings/Debug drawer, and the Display & controls divider now use Ariel's edited silver-and-midnight sheet. Text and controls remain semantic HTML, and the dialogue remains a native modal. This is a bounded decorative compositor, not a theme editor, a replacement input engine, or new RPG state.

## 1. Canonical files and provenance

| File | Role |
| --- | --- |
| [Window.png](../assets/source/ui/base/Window.png) | Exact user-edited 192 × 192 RGBA source, 3,112 bytes. |
| [Window.manifest.json](../assets/source/ui/base/Window.manifest.json) | Version 1 rectangles, roles, anchors, fit rules, and alpha/provenance metadata. |
| [Window.audit.json](../assets/source/ui/base/Window.audit.json) | Reproducible measurements of this edit, including known mismatches. |
| [Source notes](../assets/source/ui/base/README.md) | Ownership, original companion identities, import policy, and generation warning. |
| [audit-windowskin.mjs](../tools/audit-windowskin.mjs) | Dependency-free offline geometry/PNG/alpha/connector audit. |

The source PNG SHA-256 is `758fb5bf370a5c7c2cee950c861245491cd127a8a48d036a7f3d0030c79007e6` (3,112 bytes, 32 partial-alpha pixels). It matches Ariel's second accepted edit byte-for-byte; her superseded first edit (3,862 bytes, SHA-256 `2c81d15a1217059fd7c5177b92fffb3a78ca07c0edb305770083e396f645552a`) remains recoverable from history. Both edits keep partial transparency unthresholded. The original kit generator produces the earlier, stronger artwork and MUST NOT overwrite this PNG.

The imported manifest preserves all 64 tile definitions, their coordinates, and all fitting metadata from the companion. Only theme, status, alpha description, and the original-manifest hash metadata were updated. Its SHA-256 is `c2968d1ed7b7c93c60eaf55b045e0d93217debd141de151940609396ccc29056`. This is an artwork/metadata revision within packing version 1, not an RPG Maker-compatible Window.png.

## 2. Runtime behavior

`src/presentation/skin/layout.ts` computes bounded source-UI-pixel span/title geometry. `paint.ts` extracts the exact atlas rectangles into one reusable off-DOM Canvas 2D scratch surface. `src/presentation/ui/windowskin.ts` applies the resulting bitmap as an element background; there is no DOM element for each repeated tile, no accessible decorative canvas, and no decoration hit target. `windowskin.css` supplies padding, readable live text, focus/state cues, and plain fallback styles.

The app owns three surfaces: the shared Settings/Debug drawer frame, its Settings section divider, and the conversation/travel dialog frame. The atlas loads only when a surface becomes visible and is reused for the application's lifetime. Vite emits it as a hashed PNG rather than inlining it. A fresh clean play screen does not request it until needed. No dependency, lockfile, Node requirement, controller preference, map schema or gameplay state changes.

A single scheduled invalidation responds to visibility, size, title and font-loading changes. Unchanged geometry/title keys skip painting. Hidden or idle frames do not repaint on each game update or live Debug-table update. Three surfaces retain their current background only, with one reusable scratch bitmap, no historical size cache, a 4,096-source-pixel side cap and a 2,000,000-pixel per-frame-surface cap. These bounds are not measured total browser/GPU memory. Disposal removes observers/listeners, cancels pending work, releases the image/scratch canvas, and clears backgrounds.

A failed, wrong-size, or five-second-timed-out atlas falls back to plain usable windows and a Debug notice. Decoration failure does not stop map travel or hide dialogue. Oversized/invalid paint geometry also falls back. A reload is required to retry a failed skin in this first implementation. Actual game failures retain the existing visible error behavior.

## 3. Exact tile packing

The sheet has **8 rows × 8 columns**, labeled **A1–H8**: A is the top row; 1 is the left column. Each cell is **24 × 24**, with a **16 × 16** artwork rectangle inset **4 pixels** from every edge. Adjacent artwork therefore has an eight-pixel transparent gap. Extract and repeat only the artwork, never its gutter.

For zero-based column c and row r, the source rectangle is `(4 + 24c, 4 + 24r, 16, 16)`. Coordinates start at the upper-left; X increases right and Y increases down. Rectangle ends are exclusive: A1 is `[4,20) × [4,20)` and H8 is `[172,188) × [172,188)`. All coordinates below are source pixels, not CSS pixels. H8 remains transparent and reserved. Do not trim, rotate, repack, resize, or paint guides into the source without a contract change.

The alpha channel is straight RGBA8 and includes partial alpha. The original sample's binary-alpha assumption does not apply to this edit. Transparent gutters and sample-template marks are separate: colored guide marks never belong in the runtime PNG.

## 4. Corners, live titles, and fixed anchors

A normal frame has four fixed corners, horizontal/vertical runs, and a quiet interior fill. Corners and ornaments are never stretched. The frame band is 16 source-UI pixels, with a rail center at coordinate 8. Artwork footprint and live-content padding are separate. A 32 × 32 frame is a structural minimum, not a practical text window.

A titled top edge is assembled in this order: top-left corner → left repeat → title.open → measured live title over title.fill → title.close → right repeat → top-right corner. Brackets protect the title opening; no text is baked into the atlas. If the title wraps or cannot fit safely between the corners, it becomes an ordinary wrapped header inside an uninterrupted frame. Its font is not squeezed to fit.

A side can be upper fill → midpoint ornament → lower fill. The lower edge has equivalent left/mid/right roles. Midpoints are fixed geometric anchors, not decorations embedded in the looping rail. Their tile starts at `floor((edgeLength - 16) / 2)` relative to that edge's frame bounds. Even/odd dimension differences use consistent raster rounding, not fractional blur. Optional side/bottom ornaments are omitted on frames smaller than 96 source-UI pixels along the relevant dimension. W1 uses title gaps, side midpoints, and a bottom midpoint; an untitled top midpoint is retained in the atlas but not selected by the current painter.

The current dialogue uses 2× UI artwork at viewport width ≥768 and height ≥500 CSS pixels, otherwise 1×; the drawer uses 1×. This is independent of the 320 × 192 world's integer enlargement. Frame placement is snapped within the element. The live text lays out at readable CSS sizes. Fractional browser zoom/device ratios are not guaranteed pixel-perfect.

Long dialogue starts at its first line. Only the body scrolls; title and action buttons remain outside that scroller. New pages and reopened conversations reset the body to its beginning without moving keyboard focus or changing the gameplay input owner. Menu/F2 access, native modal priority, neutral controller rearming, and closed-by-default tools are preserved.

## 5. Divider and junction vocabulary

A free horizontal divider is cap.left → horizontal repeat → optional midpoint/junction → horizontal repeat → cap.right. A frame-connected divider substitutes attach.left/right for the caps. Vertical dividers use the corresponding top/bottom pieces. A labeled divider inserts divider.label.open → live heading → divider.label.close. If the heading does not fit, it sits above a plain divider rather than being compressed.

N/E/S/W identify connecting tile edges. `tee.n` connects N/E/W; `tee.e` N/E/S; `tee.s` E/S/W; `tee.w` N/S/W. Elbow names list their two connections. A cap names its CLOSED end: cap.left connects east, cap.top connects south. A frame attachment joins the thicker outer frame to the thinner divider, and must not be substituted for an interior T. Position a divider tile at centerline minus 8 source pixels. Do not stack translucent rails to invent a crossing; use its explicit junction tile once.

**Implemented subset:** W1 renders a real free horizontal, captioned Settings divider using caps, repeats, plain connectors and label brackets. The complete cross/T/elbow/attachment/vertical vocabulary is retained and audited, not claimed to be a general runtime layout API. In particular D6 (right frame attachment) is not used; it does not match the revised right bevel without a later explicit compatibility decision. Controls currently use CSS state/focus styling, not the optional H-row nine-slices. The H-row and G-row glyphs remain available for later exercised features.

## 6. Mirrored terminal tile and connector policy

For a rail length L, let q=floor(L/16), r=L mod 16:

- L=0 draws nothing; L<16 draws a compatible plain rail cropped to L.
- r=0 draws q full normal repeats.
- Otherwise draw q−1 normal repeats, r plain pixels, then one FULL lengthwise-mirrored tile.

Thus **53 = 16 + 16 + 5 plain + 16 mirrored**. Horizontal finishing tiles mirror left/right; vertical ones top/bottom, not across bevel thickness. No ornamental tile is truncated or stretched. The remainder is a quiet connector before the intact final motif. Background fills, unlike ornamental rails, may tile and clip at the interior boundary.

The original kit's exact-seam guarantee required each repeat's first and last four pixels to equal its plain rail. Ariel changed some of those pixels. W1 preserves her art and the finishing geometry, but does not falsely claim universal color/alpha continuity or constant ornamental rhythm.

**Explicit right-side adapter:** right-edge plain gaps sample the north port row of their own B4/B6 repeat and extend that one-row profile longitudinally. This preserves the revised bevel instead of inserting the incompatible F7 profile. It changes no source bytes and performs no alpha thresholding. Under the first accepted edit all eight right border/corner port comparisons matched that derived profile; the second edit moves the mid.right edge profile, so its north/south derived checks record as two retained, seen seams. It is not a general repair for the other shoulder differences or for the unused D6 attachment.

## 7. Audit results and limits

Run `node tools/audit-windowskin.mjs` to print the recomputed report. `--write` replaces the REPORT only, never the PNG. Unit tests recompute and compare it with the committed report and enforce the exact source identities. The PNG decoder checks chunk CRCs, bounded decompression, format/dimensions, packing and transparency. It is an audit for this canonical asset, not a general image-import library.

| Measurement | Observed result |
| --- | --- |
| Dimensions / bytes | 192 × 192 RGBA8 / 3,112 bytes (second accepted edit) |
| Gutters / reserved H8 | 20,480 gutter pixels transparent; H8 transparent |
| Partial-alpha pixels | 32, preserved |
| Declared connector edges | 96; 82 match the original canonical profiles |
| Original-profile mismatches | Fourteen: A3:W/E, A5:S, B2:N/S, B4:upper/lower N/S, B5 N/S, B6:upper/lower N/S, C3:W/E, C5:N |
| Right-side derived-profile checks | Per recorded history match for the prior edit; the second edit's right/bottom profiles shift with the artwork (see Window.audit.json per-tile counts) |
| Repeats with original-shoulder differences | Recorded per the recomputed report |

See Window.audit.json for the per-tile counts. These differences in the second edit are intentionally retained, not suppressed, repainted or hidden: the accepted connector policy (right edge plain gaps derive from their own B4/B6 north-port rows) is unchanged runtime behavior, and exact per-tile matches are measured fresh on each audit. The two actual windows are usable with this source and declared connector policy; full junction and arbitrary-theme perfection are not claimed.

## 8. Complete slot map

All listed rectangles are **16 × 16**, excluding gutters. All 64 definitions are preserved; only the subset described above is used by W1.

| Slot | Semantic ID | X | Y | Kind | Connecting edges |
| --- | --- | ---: | ---: | --- | --- |
| A1 | `corner.tl` | 4 | 4 | fixed | E:frame, S:frame |
| A2 | `edge.top.left` | 28 | 4 | repeat | W:frame, E:frame |
| A3 | `mid.top` | 52 | 4 | fixed | W:frame, E:frame |
| A4 | `edge.top.right` | 76 | 4 | repeat | W:frame, E:frame |
| A5 | `corner.tr` | 100 | 4 | fixed | W:frame, S:frame |
| A6 | `fill.plain` | 124 | 4 | fill | — |
| A7 | `fill.pattern` | 148 | 4 | fill | — |
| A8 | `fill.inset` | 172 | 4 | fill | — |
| B1 | `edge.left.upper` | 4 | 28 | repeat | N:frame, S:frame |
| B2 | `mid.left` | 28 | 28 | fixed | N:frame, S:frame |
| B3 | `edge.left.lower` | 52 | 28 | repeat | N:frame, S:frame |
| B4 | `edge.right.upper` | 76 | 28 | repeat | N:frame, S:frame |
| B5 | `mid.right` | 100 | 28 | fixed | N:frame, S:frame |
| B6 | `edge.right.lower` | 124 | 28 | repeat | N:frame, S:frame |
| B7 | `title.open` | 148 | 28 | fixed | W:frame |
| B8 | `title.close` | 172 | 28 | fixed | E:frame |
| C1 | `corner.bl` | 4 | 52 | fixed | E:frame, N:frame |
| C2 | `edge.bottom.left` | 28 | 52 | repeat | W:frame, E:frame |
| C3 | `mid.bottom` | 52 | 52 | fixed | W:frame, E:frame |
| C4 | `edge.bottom.right` | 76 | 52 | repeat | W:frame, E:frame |
| C5 | `corner.br` | 100 | 52 | fixed | W:frame, N:frame |
| C6 | `title.fill` | 124 | 52 | fill | — |
| C7 | `divider.label.open` | 148 | 52 | fixed | W:divider |
| C8 | `divider.label.close` | 172 | 52 | fixed | E:divider |
| D1 | `divider.h.repeat` | 4 | 76 | repeat | W:divider, E:divider |
| D2 | `divider.h.mid` | 28 | 76 | fixed | W:divider, E:divider |
| D3 | `divider.v.repeat` | 52 | 76 | repeat | N:divider, S:divider |
| D4 | `divider.v.mid` | 76 | 76 | fixed | N:divider, S:divider |
| D5 | `attach.left` | 100 | 76 | fixed | N:frame, S:frame, E:divider |
| D6 | `attach.right` | 124 | 76 | fixed | N:frame, S:frame, W:divider |
| D7 | `attach.top` | 148 | 76 | fixed | W:frame, E:frame, S:divider |
| D8 | `attach.bottom` | 172 | 76 | fixed | W:frame, E:frame, N:divider |
| E1 | `divider.cross` | 4 | 100 | fixed | N:divider, S:divider, E:divider, W:divider |
| E2 | `divider.tee.n` | 28 | 100 | fixed | N:divider, E:divider, W:divider |
| E3 | `divider.tee.e` | 52 | 100 | fixed | N:divider, E:divider, S:divider |
| E4 | `divider.tee.s` | 76 | 100 | fixed | E:divider, S:divider, W:divider |
| E5 | `divider.tee.w` | 100 | 100 | fixed | N:divider, S:divider, W:divider |
| E6 | `divider.cap.left` | 124 | 100 | fixed | E:divider |
| E7 | `divider.cap.right` | 148 | 100 | fixed | W:divider |
| E8 | `divider.cap.top` | 172 | 100 | fixed | S:divider |
| F1 | `divider.cap.bottom` | 4 | 124 | fixed | N:divider |
| F2 | `divider.elbow.es` | 28 | 124 | fixed | E:divider, S:divider |
| F3 | `divider.elbow.sw` | 52 | 124 | fixed | S:divider, W:divider |
| F4 | `divider.elbow.ne` | 76 | 124 | fixed | N:divider, E:divider |
| F5 | `divider.elbow.wn` | 100 | 124 | fixed | W:divider, N:divider |
| F6 | `edge.h.plain` | 124 | 124 | plain | W:frame, E:frame |
| F7 | `edge.v.plain` | 148 | 124 | plain | N:frame, S:frame |
| F8 | `divider.h.plain` | 172 | 124 | plain | W:divider, E:divider |
| G1 | `divider.v.plain` | 4 | 148 | plain | N:divider, S:divider |
| G2 | `edge.h.collar` | 28 | 148 | fixed | W:frame, E:frame |
| G3 | `edge.v.collar` | 52 | 148 | fixed | N:frame, S:frame |
| G4 | `pointer.left` | 76 | 148 | icon | — |
| G5 | `pointer.right` | 100 | 148 | icon | — |
| G6 | `arrow.up` | 124 | 148 | icon | — |
| G7 | `arrow.down` | 148 | 148 | icon | — |
| G8 | `continue` | 172 | 148 | icon | — |
| H1 | `control.normal` | 4 | 172 | nine-slice | — |
| H2 | `control.hover` | 28 | 172 | nine-slice | — |
| H3 | `control.pressed` | 52 | 172 | nine-slice | — |
| H4 | `control.disabled` | 76 | 172 | nine-slice | — |
| H5 | `control.focus` | 100 | 172 | nine-slice | — |
| H6 | `check.off` | 124 | 172 | icon | — |
| H7 | `check.on` | 148 | 172 | icon | — |
| H8 | `reserved` | 172 | 172 | reserved | — |

H1–H5 retain four-pixel nine-slice margins: only flat centers and straight rails may stretch in a future small-control renderer; corners stay fixed. H6/H7 are checkbox glyphs. The continuation glyph is one static frame, not an animation or a binding. These descriptions preserve the asset contract, not a claim that W1 renders every slot.

## 9. Verification and recovery record

The interrupted implementation survived as `75bed7605ed6d4eb857cc92027d0ebc25b86e420` on work/w1-base-skin. [Run 35369541935](https://github.com/FromAriel/RPGameworks/actions/runs/35369541935) passed all Windows/Node 24.15.0, Linux/Node 24.15.0 and Linux/Node 22.16.0 jobs. Both Node 24 jobs used npm 11.6.2. Each leg ran installation, source checking, 207 unit tests, content validation, production builds and 78 Chromium scenarios. The retrieved Linux/Node 24 report records 78 expected, zero unexpected, zero flaky and zero skipped results.

Recovery retained that runtime rather than reimplementing it. The recovered local source tree matched Git tree `755774a00cafa80172ab4289a930013e72c58a52`; the only difference from the tested candidate was the temporary read-only source-export workflow. Local checks, 207 unit tests, builds and the audit were rerun with CI-exported dependencies whose package-lock.json matched exactly. The final delivery removes that temporary workflow, adds this explainer/provenance and updates the handoff. Its own normal CI is authoritative for the final main revision, not merely the earlier candidate pass.

The added 17 unit cases include exact asset/manifest hashes, reproducible audit, geometry across every rail length 0–4096, the 53-pixel finish, title fallback, ornament spacing and invalid/budgeted dimensions. Thirteen added browser scenarios cover the actual Settings/divider and Mara window, narrow/wide/odd sizes, long Unicode/literal text, lazy single atlas loading, idle/hidden painting counts, repeated openings, disposal, three skin-load failures with working travel, and long-dialogue scrolling/page reset. Existing controller, interaction, scene-restart and 40-transfer tests remain.

Visual review during the interrupted work caught a real long-message issue: focusing actions could scroll the text to the end. The final candidate separates fixed actions from the text scroller and resets it on each page; an actual wheel-scroll/page-change/reopen regression covers the repair. Recovered screenshots of dialogue, Settings, narrow/remainder layout and the long-title case were reviewed again. They are actual browser outputs, not image-generated mockups.

Local Git network access was unavailable during recovery, so the authenticated connector and its read-only source export supplied the exact repository bytes. Browser evidence here comes from hosted CI; no new local browser pass, physical Elite test, phone certification, other browser-engine certification, deployment, or long-session heap/GPU plateau is claimed. Tiny PNG size and lack of repeated painting are not a substitute for M1.6's measured baseline.

**Next:** finish M1.6 using the skinned playable slice and the approved workload. Then follow M2/N1, G1 and M3 from NEXT-SLICES. Do not start new themes, a general windowskin editor, inventory, or conditional doors as part of W1 closeout.
