# Node 24 compatibility and Windows setup repair

**Date:** September 17, 2026 (America/Los_Angeles; CI timestamps use September 18 UTC).

## Report and cause

Ariel ran the foundation on Windows with Node 24.15.0 and npm 11.6.2. Asset generation worked, but `npm ci` rejected the application with `EBADENGINE`: the original root package allowed only `>=22.16.0 <23`, and `.npmrc` enabled strict engine validation. Without a successful dependency installation, later npm scripts could not find the local `tsc` and `vite` executables.

This was an unnecessarily narrow project compatibility declaration, not evidence that the user's newer Node installation was broken. The npm upgrade notice was unrelated to this failure.

## Repair

The root package now accepts `>=22.16.0 <23 || >=24.15.0 <25`. The root engine metadata in `package-lock.json` is synchronized. Every dependency entry, version, integrity hash, and download reference is unchanged; no dependencies were upgraded or re-resolved. `.npmrc` remains strict. `.nvmrc` retains 22.16.0 as one reproducible default rather than the only accepted runtime.

Three unit checks now keep the package and lockfile root engine policy, dependency pins, and identity synchronized. The suite therefore contains 22 unit tests. Normal CI tests Linux/Node 22.16.0, Linux/Node 24.15.0, and Windows/Node 24.15.0. Both Node 24 jobs explicitly select npm 11.6.2 to reproduce the reported toolchain. CI installs development dependencies explicitly and runs the production-browser suite on every matrix leg. Artifacts use matrix-specific names to avoid upload conflicts. Normal CI retains read-only repository permissions.

## Verification identity and results

The preparation and compatibility run is [35290573553](https://github.com/FromAriel/RPGameworks/actions/runs/35290573553), based on source commit `394b668948d0d35b8a9b91169c45b3a87981ed6c` and synchronized lockfile blob `117d68eb3ddd05e199d06d61c861a2d40d857e2d`. Preparation asserted that only the lockfile root engine policy changed, then provided that exact file to all matrix jobs.

Installation with strict engine checks, TypeScript checking, unit tests, production builds, and all 8 Chromium browser scenarios passed on Linux/Node 22.16.0, Linux/Node 24.15.0, and Windows/Node 24.15.0. Both Node 24 jobs used npm 11.6.2. The Windows job is `105432344113`, and the Linux jobs are `105432344133` (Node 24) and `105432344221` (Node 22).

The delivered main commit includes the synchronized lockfile directly and excludes the temporary preparation workflow. Its own normal CI run is the authority for the final commit. Do not mistake the preparation commit, which carries the old lockfile until the preparation step, for the installable release. The temporary job created only a lockfile blob; it did not force-push or rewrite a branch.

Hosted Windows testing does not inspect Ariel's machine and is not a performance certification for consumer Windows hardware. Real-device, Safari, and Firefox limitations from the foundation record remain. Local outbound DNS was unavailable, so package installation and application checks ran on GitHub-hosted runners, not in the chat container.

## Run the repaired project

Keep the existing Node 24.15.0 and npm 11.6.2 installation. Pull the repaired `main`, install the lockfile including development tools, and then start the development server:

```powershell
Set-Location -LiteralPath 'G:\RPGameworks' -ErrorAction Stop

git switch main
if ($LASTEXITCODE -ne 0) { throw 'Could not switch to main; no files were reset.' }

git pull --ff-only
if ($LASTEXITCODE -ne 0) { throw 'Pull failed; resolve the reported Git error before installing.' }

npm ci --include=dev
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed; do not run build or preview yet.' }

npm run dev -- --open
```

For production preview, stop the development server with Ctrl+C and use:

```powershell
npm run build
if ($LASTEXITCODE -ne 0) { throw 'The production build failed; preview was not started.' }

npm run preview -- --open
```

Do not install TypeScript or Vite globally, disable `engine-strict`, delete the lockfile, or upgrade npm to repair this issue. The build tools belong to this project's development dependencies. Do not run preview until the build succeeds. These commands assume a Git checkout with its configured upstream; an extracted source archive must instead be replaced with the repaired source without overwriting unrelated local work.

## References

Official npm [engine-strict configuration](https://docs.npmjs.com/cli/v11/using-npm/config/#engine-strict) explains the installation refusal. Official npm [run-script documentation](https://docs.npmjs.com/cli/v11/commands/npm-run/) explains project-local executable resolution. Both were opened during this repair. Repository configuration and actual CI output, rather than generic version guidance, establish this project's compatibility evidence.

## Next development packet

This repairs setup; it adds no game features. The next planned task remains M1.3: validated map data, stable IDs, two map fixtures, and pure collision data.
