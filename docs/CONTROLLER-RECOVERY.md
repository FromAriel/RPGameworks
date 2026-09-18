# Controller recovery and page-error isolation

## Report and confirmed code defect

Ariel reported an unresponsive controller alongside `Corruption: block checksum mismatch` messages attributed to `content.js`, `globals-front.js`, the document and `about:blank`. The pasted console output does not identify the storage owner or establish whether the browser is exposing her physical controller. Those script basenames alone are not enough to identify a particular extension.

Inspection of the prior `src/main.ts` confirmed a separate application bug: every `window.error` and `unhandledrejection` event called the fatal game reporter. That set `failed = true`, and the startup autofocus path only ran while `!failed`. An unrelated page rejection during startup could therefore prevent viewport focus even though the room loaded correctly. Controller polling also requires viewport focus, so this was a real route to apparently inactive controls. It is not proof that it is the only problem on Ariel's device.

## Changes

- Unattributed global page errors now appear as a bounded warning (count plus last error), separately from fatal application errors. No browser error is suppressed with `preventDefault`; the original console message/stack remains available. Warnings do not set the fatal startup flag or prevent autofocus.
- Explicit startup/load failures remain fatal. Scene creation and updates have explicit error boundaries that stop input and report scene failure. This does not claim attribution of every possible renderer or injected-script exception.
- A visible controller status distinguishes detection, API failure, disabled input, focus/settings pause, and waiting for neutral controls. The existing neutral rearm and modal gating remain intact.
- **Activate controller** enables controller input if disabled, closes settings, rescans exposed devices, resets the input latch, and focuses the viewport. It does not pair hardware, override permissions, silently change mappings, or manufacture device exposure.
- **Rescan controllers** refreshes detection without starting gameplay. Detection can use the existing 4 Hz UI timer when the scene is not polling, including after a map-load failure. It does not add an independent animation loop or arm input from telemetry.
- **Show diagnostic report** produces selectable text containing build/runtime state, browser and origin, detected devices/mappings, exposed axes/buttons, settings, focus state, input polling age, and the last page error. Nothing is uploaded automatically. Data and error strings are bounded; review the report before sharing.
- Startup focus remains pending while the document is hidden, rather than consuming its one-time attempt before the game can be seen.

No dependency, map schema, save format, controller preference format, or Node compatibility range changes.

## Use

After pulling and restarting the local server, keep the game tab active, press and release a controller button to allow browser detection, click **Activate controller**, and briefly center the sticks/release mapped buttons. The left stick or D-pad should drive standard-layout controllers; A is the existing cosmetic burst.

Opening configuration deliberately pauses movement. Use the live readout there to establish whether inputs are arriving. Return to the game before testing player movement. DevTools or another window holding focus can also pause gameplay.

For a remaining failure, the diagnostic report separates no detected device, API permission failure, unsupported mapping, non-neutral controls, lost focus, and a game startup failure. This is more actionable than guessing from an unrelated checksum message.

Do not delete the browser profile, extension storage or all site data based on this log. Diagnosing underlying storage corruption requires its actual source. An extension-free browser profile is a non-destructive isolation test, not a claimed repair.

## Verification

Local Node 22 source checking, all **129 unit tests**, content validation and production building pass with the existing CI-exported locked dependencies. Six new unit tests exercise the bounded error log, including repeated and uninspectable rejection objects.

Seven new browser scenarios bring the suite to **37**. They deliberately reject promises with the reported checksum text before/after scene startup, verify continued focus/movement, exercise activation and reports, inspect detection despite map failure, preserve permission-error details, distinguish neutral waiting, and ensure a genuine scene update fault remains fatal. Intentional rejections have exact per-test error assertions; the existing suite's no-uncaught-error fixture is unchanged.

Local Chromium navigation was blocked with `ERR_BLOCKED_BY_ADMINISTRATOR` before the application loaded. This is not an application browser-test pass. Source revision **`0ea8825d4460d26412d4d15a3e9ae9b8c35a775c`** passed [CI run 35307998894](https://github.com/FromAriel/RPGameworks/actions/runs/35307998894) on Linux/Node 22.16.0, Linux/Node 24.15.0, and Windows/Node 24.15.0. All three legs passed installation, source checks, 129 unit tests, all 37 browser scenarios, and production builds. The Node 24 jobs used npm 11.6.2. The controller-report screenshot was inspected. The final main handoff has its own CI run, which is authoritative for that final commit. Hardware inputs remain simulated in automated tests, not a physical Elite Series 2 certification.

## References

Inspected official documentation: [W3C Gamepad API](https://www.w3.org/TR/gamepad/), [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), and [MDN unhandledrejection](https://developer.mozilla.org/en-US/docs/Web/API/Window/unhandledrejection_event). These explain browser device exposure and page/extension boundaries; they do not identify the source of Ariel's checksum error.

The next gameplay work remains M1.4/M1.5 interaction and doors, not a new rendering or gamepad framework.
