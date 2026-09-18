# Player-first interface

**September 18, 2026.** User-requested presentation packet after M1.5. This does not complete M1.6 performance closeout or start M2.

## Default play experience

The browser viewport is the play area, with a black background and the existing 320 × 192 logical game view centered within it. There is no demo heading, permanent controller status, runtime table, build footer, map selector, or desktop direction-button strip in normal play. A small Menu button remains available at the top right. No title-screen gate, fake inventory, extra game content, or browser Fullscreen API request was added.

The canvas uses the largest whole-number enlargement that fits both dimensions. The former 4x cap and partial-window height budget are removed. Center offsets are rounded to whole CSS pixels. The logical resolution, visible world extent, tile movement and camera rules remain unchanged. If either available dimension is smaller than the logical canvas, proportional downscaling fits the complete view rather than cropping it or introducing document scrollbars. That undersized fallback is not claimed to be pixel-perfect; integer enlargement remains the normal path. Browser zoom/device-pixel ratio can also affect physical-pixel alignment.

A responsive stage changes only its CSS presentation. It does not rebuild the map, restart the game, increase the logical resolution or create another controller sampler. Phaser continues owning canvas size and coordinate bounds. The existing ResizeObserver schedules bounded resize work outside observer delivery.

## Optional interface layer

**Menu / Escape** opens Settings during exploration. **F2** opens or closes Debug directly. The close button, Return to game, or Escape closes the drawer and restores viewport focus. The panel always starts closed after a page load. Keyboard tab controls support arrow keys, Home and End. Shortcuts do not override text entry, open dialogue or travel modals.

At widths of at least 1,000 CSS pixels the drawer occupies a 360-pixel side column and the play area fits the remainder. Below that breakpoint it overlays the right side without shrinking an already small game view. The panel has its own scrolling; the page itself does not scroll.

Settings contains particles, optional on-screen controls, collapsible instructions, and the complete controller configuration/activation/readout/report. Debug contains the original live diagnostic table, current map/render information, page warnings, build identity, map preview and room restart. Preview still reloads the document; actual doors do not.

Clicking the play area allows gameplay while the drawer remains visible, useful for watching live Debug. Focusing or using controls inside the panel clears held/queued gameplay input. An already-committed movement step may finish, as before. Controller configuration remains an explicit input pause even if the viewport is clicked; close it or use Return to game. Closing the outer drawer also collapses nested configuration so hidden settings cannot leave input blocked. Actual pauses retain neutral-stick rearming. Restart is an explicit developer action, separate from permission to move while using the panel.

No controller-only menu navigation or new Menu-button binding is claimed. Existing controller exploration, messages, travel and custom assignments are preserved.

## Touch and messages

On-screen directional/action controls are an overlay rather than a page-layout strip. They are hidden by default with a fine primary pointer and automatically enabled for a coarse primary pointer. Settings can override this for the current page session; no new preference storage or schema is introduced. A touchscreen-equipped desktop need not report a coarse primary pointer, so manual opt-in remains available.

Messages use the existing native dialog, now styled as a bottom message window. Escape still closes the message instead of opening the drawer. F2 cannot cover a conversation or pending travel. Literal text rendering, wrapped/scrolling long text, modal focus ownership, failure recovery and controller edge handling are unchanged.

## Instrumentation and failures

The read-only runtime snapshot remains available for automation and development. The diagnostic table is built/refreshed only while the Debug tab is visible; a browser MutationObserver check verifies no hidden table updates. Basic readiness and controller detection still use the existing app services. This is not a claim that all diagnostic work has zero cost while hidden.

Loading and fatal application errors remain visible in the play area even when tools are closed. Unattributed global page errors remain in the browser console and are recorded under Debug, without automatically opening it or failing a healthy game. They are not swallowed or reclassified as proven extension errors.

## Compatibility and scope

No packages, lockfile, Node range, maps, assets, gameplay saves, controller v2 settings or migration rules change. Existing installations need only pull and restart. This is a layout/input-boundary change, not new world simulation, art or a general editor.

## Verification

Local strict source checking, **190 unit tests**, content validation and production building passed using the existing genuinely lockfile-installed dependencies. The local source tree was matched to the candidate Git tree. Twelve added viewport tests cover desktop/4K/docked/portrait sizes, small-window fallback and invalid dimensions.

Nine new production-browser scenarios bring the suite to **65**. They check closed defaults and launch focus; centered black letterboxing; full-view resizing from 280 × 160 to 3840 × 2160; live docked Debug and stopped hidden table updates; repeated menu/tab changes without scene recreation; native dialogue ownership; controller pause/rearm; nested-settings closure; reload defaults; visible load errors; and coarse-pointer controls. Previous tests reach relocated settings through the real menu while retaining their gameplay, cleanup and error assertions. Expected canvas sizes changed deliberately to match the new full-viewport contract.

Candidate `57227b6589890d524458581a07ac4c12ae86ce8e` passed all three Windows/Linux legs of [run 35347806726](https://github.com/FromAriel/RPGameworks/actions/runs/35347806726), including all 190 unit tests and 65 browser scenarios. The clean-play, docked Debug, dialogue and narrow-panel screenshots were inspected. The final main commit has its own normal CI; its exact run is authoritative for delivery. Local HTTP Chromium navigation was blocked by the execution environment before app loading, so local HTTP browser success is not claimed. Hosted tests use synthetic gamepads and software rendering; narrow viewport/hasTouch tests are not physical-phone certification. M1.6 frame/resource baseline and long-session memory measurements remain future work.
