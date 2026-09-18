# Controller input: comparison with the working MouseJoy demo

**Date:** September 18, 2026. This is an input repair and controlled comparison, not completion of M1.4/M1.5.

## Evidence and limits

Ariel supplied `mousejoy_dual_stick_demo(2).html` and reported that her controller works there. Its SHA-256 is `834d4b41bf4c6f3f170fc20df9e44836c566b5ea5b854eeb4e8fdca96c0f8211`. The supplied file calls `navigator.getGamepads()` every animation frame, retains the connected device, iterates all returned slots, and accepts either numeric or object button values. It does not require focus on a particular canvas/viewport element. Three small reader functions are preserved unchanged in `tests/fixtures/mousejoy-reader.js.txt` as an independent test oracle; the full MouseJoy desktop/UI was not imported into the game.

The earlier RPGameworks report had a ready game, an available secure API, recent polling, and zero detected devices. The old adapter counted connected devices after truncating the raw slot array to 16. Mapping and gameplay focus checks happened **after** enumeration. Consequently, removing a focus or mapping gate alone cannot explain or prove a repair of that zero-device report. The high-slot regression is real in synthetic tests, but there is no evidence that Ariel's physical device occupied a high slot. Numeric-button support is compatibility hardening, not a diagnosis of her device.

The user-reported working demo is the primary comparison target. The browser profile, connection type, controller enumeration, and origin of that successful run have not been established from the upload. Neither controller hardware failure nor extension interference is established. The checksum errors remain unattributed. No browser data should be deleted on the basis of these messages.

## Changes in this packet

1. `GamepadController` owns one `requestAnimationFrame` callback for native sampling, starting independently of map loading and Phaser. Scene updates consume the latest sample through the existing input owner; there is no second gameplay simulation. Scan output and counters are reused. Scene restarts do not create samplers. Disposal cancels the callback and aborts listeners.
2. Native enumeration iterates every returned slot before filtering disconnected entries. Automatic selection retains the current connected device and follows a newly connected device, as the reference does, rather than re-ranking by `mapping` on every frame. Explicit manual selection remains authoritative. No stale connection-event object is used as a substitute for current API readings.
3. Numeric button values are accepted alongside standard `GamepadButton` objects. Existing 25% deadzone, button bindings, explicit custom-mapping opt-in, neutral rearming and stored preference schema remain unchanged. The game's movement is still cardinal, not MouseJoy cursor motion.
4. A connected controller can drive the active game page without the viewport div owning focus. Form fields, content editing, open dialogs, controller settings, hidden tabs and unfocused documents still block gameplay input. Keyboard listeners remain scoped; the app does not intercept typing globally.
5. Reports identify `inputReader: "mousejoy-frame-v1"` and include raw slot/non-null/connected counts, sampling frames, connection-event counts and last-scan age. Device details in copied reports remain bounded; bounding a report no longer hides a high-slot device from gameplay. Empty API results are never manufactured into a detected device.
6. The Vite build label uses the local Git revision when available, rather than always displaying `local`. CI retains its exact `GITHUB_SHA` identity. Source ZIPs without Git still use `local`. The default dev port is explicitly 5173 with `strictPort`, so an existing server produces a visible port-in-use failure rather than silently putting the updated game on another port.

## Same-origin reference test

`public/controller-probe.html` is a self-contained, reduced MouseJoy-style reader with both-stick meters and a raw input report. It is not the entire original desktop demo. Its discovery/button helpers follow that demo, with extra bounded reporting and API error display. There is no Phaser, game content, saved preference, canvas-focus gate, or keyboard fallback. It sends no telemetry or external requests.

Open it through **Controller configuration → Open MouseJoy-style controller test**. The link uses the same scheme/host/port as the running game, in development or a production project subpath. `Return to RPGameworks` returns to that same base. This avoids changing browser profiles and origins at once while comparing readers. The page is also self-contained when opened as a file, although a file-origin success and localhost failure would still be different browser contexts.

A detected moving controller in the probe but zero devices in the game is evidence to investigate the game path. Zero in both pages only establishes what those two page contexts receive; it does not erase the user's report that the original demo works. Review raw counts, sample age and build identity before attributing a failure to any layer.

## Verification

Local Node 22 source checking, **151 unit tests**, content validation and production builds passed using the previously exported, genuinely lockfile-installed dependencies. The 22 added unit cases compare the reader against the extracted reference and test sampler lifecycle, device replacement/manual selection, missing/high slots, fresh snapshot objects, numeric buttons, and API errors. No dependency or lockfile changes were made.

The complete supplied HTML was exercised with synthetic controller input using local Chromium `setContent`: the virtual cursor moved from X=528 to X=569.215 after a rightward stick input. This is DOM execution with injected controller data, not physical-controller or HTTP-hosted game verification. Local HTTP browser navigation was blocked by the environment (`ERR_BLOCKED_BY_ADMINISTRATOR`), so production-browser evidence must come from hosted CI.

Five additional production-browser scenarios cover high-slot/numeric readings driving the actual game, page-level focus with form safety, sampling before map load, both-stick reference output under `/RPGameworks/`, and honest empty responses in both readers. The existing 37 scenarios are retained without relaxing error assertions. Hosted CI results are recorded in STATUS when observed; the final delivery's own CI is authoritative for that commit.

**Physical Elite Series 2 operation remains unverified here.** Automated controller inputs are synthetic. These changes align the reader and fix proven code edge cases; they do not justify claiming the user's hardware failure is resolved.

## Handoff

Keep M1.4/M1.5 interaction and room-to-room work separate from this repair. Do not add more controller backends or ask for destructive browser resets without evidence from the supplied reference and the same-origin comparison. The app-owned sampler is now an explicit exception to the original scene-polled-only input design: one read callback, bounded reporting, tested disposal, and no additional world simulation.
