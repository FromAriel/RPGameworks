# Launch focus and controller configuration

**Packet:** requested input refinement after M1.3; part of the M1.4 input work, not completion of the remaining interaction/door slice.

## What to use

The game viewport receives keyboard focus once after the first scene is ready. No initial click is needed for WASD/arrows or Space. Startup does not steal focus from a setting the user has already focused while the map/atlas is loading. Normal Tab navigation remains available; there is no global keyboard trap or recurring focus enforcement.

The **Controller configuration** panel sits below the movement controls. Standard defaults are left stick axes 0/1, D-pad buttons 12–15, and button 0 (A on an Xbox layout) for the existing cosmetic burst. Connect the controller to Windows normally, open the game in the active browser tab, press and release a controller button if detection is waiting, and leave the stick centered briefly before playing.

The panel offers device selection, enable/disable, a 5–90% stick deadzone (25% default), horizontal/vertical axis selection, inversion, and separate button bindings for four movement directions and the burst. Axes 2/3 select the standard right stick. Axes may be Off; buttons may be Unassigned. Button numbers 0–63 and axes 0–15 are supported configuration bounds, not claims about available hardware inputs. Labels describe the standard layout; the live readout reports actual exposed axes and pressed button numbers. Duplicate assigned buttons or duplicate active X/Y axes are rejected visibly; unassign a binding before swapping it.

Opening the settings panel prevents new movement and burst input. A tile step already in progress finishes, as it does on ordinary key release. **Return to game** closes the panel and restores viewport focus without scrolling. Release the stick/buttons once to rearm gameplay. Keyboard/pointer movement takes precedence over the stick when both are active. D-pad input takes precedence over analog input; opposing directions cancel. Diagonal analog movement resolves to one cardinal direction, with a small axis-switch hysteresis near diagonals.

Only movement and the currently implemented pixel burst are bound. There are no pretend bindings for future dialogue, inventory, or battle actions, and no controller-only menu navigation or rumble in this packet.

## Preference storage

Settings are stored under `rpgameworks.controller.v1` in browser localStorage. They survive scene restarts and same-origin reloads. Different development/preview ports are different origins and therefore have separate preferences. Device selection is session-only; do not persist unstable browser device indices. One configuration applies to whichever controller is selected, not a library of per-device profiles.

Reads have a size bound and explicit version/type/range/conflict validation. Corrupt/future-version settings fall back to defaults with a visible message. Storage denial/quota errors leave current-session configuration usable and report that it was not saved. No gameplay save data or cloud/account integration is introduced.

## Architecture and lifecycle

`src/platform/gamepad-model.ts` contains pure configuration parsing, standard-layout interpretation, cardinal direction resolution, and button-edge/neutral latching. It has no DOM or Phaser dependency. It is platform input logic, not an RPG rule subsystem.

`src/platform/gamepad.ts` owns one app-lifetime browser adapter and its abortable focus/connection listeners. The current scene input owner polls it once per update via the existing game loop. There is no extra animation loop per controller or scene, no new package, and no simulation of off-map content. Telemetry/UI work uses the existing 4 Hz application refresh; raw readouts are formatted only while the panel is open.

`InputController` merges the already-existing keyboard/pointer controls with the gamepad source. Controller input is admitted only while the document is visible/focused, the viewport owns focus, and the settings panel is closed. The public gate is reusable when dialogue/modal ownership is introduced later. Disconnect, focus loss, disabling, configuration changes, device replacement, and scene release reset the latch. A held button cannot trigger repeatedly or be replayed after focus is restored; mapped controls must become neutral before reactivation.

Unknown/non-standard mappings are not silently treated as Xbox controllers. An explicit custom-mapping opt-in and live input readout support configuring them. API absence or a thrown permission error is a controller-specific status, not a fatal game startup error. Keyboard/pointer controls remain available.

## Browser and Elite Series 2 limits

The W3C Gamepad specification defines the standard layout and notes that a user gesture can gate device exposure; it also allows browsers to limit exposed capabilities. Microsoft documents the Elite Wireless Controller Series 2's Windows connectivity and hardware profiles in Xbox Accessories. This implementation targets the browser's reported standard layout, not a vendor name or an unverified device-ID string.

Actual paddles may not appear as independent browser buttons. The configuration can bind whatever button indices the browser exposes, but it does not program controller firmware, pair Bluetooth devices, or replace Xbox Accessories. No assertion that all Elite features work over every connection is made. Physical USB/Bluetooth/adapter tests on Ariel's controller remain outstanding.

Primary references inspected September 17, 2026:

- [W3C Gamepad specification: standard mapping and exposure](https://www.w3.org/TR/gamepad/).
- [MDN: Using the Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API).
- [Microsoft: Xbox Elite Wireless Controller Series 2](https://www.xbox.com/en-US/accessories/controllers/elite-wireless-controller-series-2).

## Verification

Source checking, the **123-test unit suite** (40 new controller cases), map validation, and production build passed locally using the genuine lockfile-installed dependencies exported by CI. Local browser navigation returned `ERR_BLOCKED_BY_ADMINISTRATOR`; it is not recorded as an application test pass.

The production-browser suite now includes 12 new scenarios, for **30 total**. Controller cases inject Gamepad API readings at the browser boundary and exercise the real application movement/effects/configuration paths. They are synthetic-controller integration tests, not evidence that an actual Elite controller was connected to the CI runner. They cover launch without click, non-stealing slow startup, deadzone/D-pad/stick mappings, action edges, disconnect/reconnect, persistence and storage failure, device selection, custom mapping, disabled/unavailable API, settings focus, hidden/blurred documents, restarts, and desktop/narrow settings layout.

Source revision **`ac86f175bf471b609c8abf484e6318234e4bc278`** passed [CI run 35297625726](https://github.com/FromAriel/RPGameworks/actions/runs/35297625726) on Linux/Node 22.16.0, Linux/Node 24.15.0, and Windows/Node 24.15.0. Node 24 jobs used npm 11.6.2. All three legs passed strict dependency installation, source checking, 123 unit tests, all 30 production-browser scenarios, and portable production builds. The desktop and narrow settings screenshots were inspected; their device label is explicitly a simulated test controller, and their 45% deadzone/X binding demonstrates edited settings rather than defaults.

The final main delivery has a separate normal CI run that must be checked for that exact commit. The temporary read-only workspace-export workflow is not included in the delivered tree. Existing map schemas, content, dependency pins, and accepted Node ranges are unchanged.

## Next work

Continue M1.4/M1.5 with NPC interaction, a minimal message presenter, and real room-to-room transitions. Reuse the input gating/lifetime boundaries instead of allowing the same controller press to both dismiss a dialogue and trigger an exploration action.
