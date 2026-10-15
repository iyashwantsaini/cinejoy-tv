# Project context and handoff

Last reviewed: 2026-10-15.

This is the continuation point for work on Cinejoy TV. The concise, automatically
loaded Copilot context is [copilot-instructions.md](../.github/copilot-instructions.md).
That file instructs future sessions to read this document. Keep it factual and
update it after meaningful implementation or release changes.

## User goal and decisions

- The user owns a TCL Android TV and does not want a browser's virtual mouse.
- They want D-pad/OK/Back navigation, movie/server/subtitle/player controls, and a
  website URL setting because `https://cinejoy.pk/` may move.
- They requested the same launcher icon as the website.
- They requested a private GitHub repository, useful maintenance docs, persistent
  VS Code context and a proper release system.
- Chosen architecture: native Android TV shell around the live website, with a
  JavaScript navigation adapter. No undocumented catalogue API, scraped catalogue
  cache, extracted streaming backend or native replacement player was introduced.
- Repository: [iyashwantsaini/cinejoy-tv](https://github.com/iyashwantsaini/cinejoy-tv).
  It was created as private after reconnecting the GitHub CLI.

## Implemented app

- Java Activities, native focusable toolbar and app menus, URL settings and data reset.
- Saved HTTPS address, canonicalized origin checks, native text/select dialogs.
- Spatial arrow navigation, automatic shelf scrolling, hidden/disabled filtering,
  dynamic page recovery and modal focus containment.
- Embedded-frame command routing using `postMessage`; native UI messages are
  accepted only from the configured main-frame origin.
- Remote player actions: Play/Pause, bounded 10-second seeks, servers, subtitles,
  settings and fullscreen. Menu or long OK opens app controls.
- Movie timeline `step="any"` handling; subtitle delay/range/color inputs, nested
  language/track menus and file-upload labels.
- Trusted Android Enter events for actions requiring browser user activation.
- Back closes a supported submenu before leaving fullscreen or browser history.
- Top-level external navigation, pop-ups, downloads and device permission requests
  are blocked. A deliberate file selection uses Android's document picker.
- Original public website icon; TV banner incorporates the same icon.

## Evidence from the first session

The live site was inspected on 2026-10-15:

- Home, search, movie detail and `/watch/movie/1058424` (the inspected movie was Hope).
- HTML5 video, play/seek/volume/fullscreen controls.
- Server selector with Nebula, Lisbon, Solara and Athens. The adapter moved focus
  through server buttons and selected Lisbon.
- Subtitle language and English-track lists; nested Back behavior; font, delay,
  size, position, background and color controls.
- Playback menu: quality, source, subtitles, audio, sleep timer, watch-party link,
  speed, zoom, volume boost and brightness. Some items depend on provider support.

The video stayed paused with `readyState = 0`. Some auxiliary website requests
also failed. **Navigation was verified; successful live streaming was not.**
Do not reinterpret this as verified playback or as proof of a particular network
or server root cause.

Local app checks passed: debug APK build, signature verification, 15 browser tests,
3 Java tests and lint with zero errors. Four advisories concerned SDK/dependency
versions and TV landscape orientation. The browser performance fixture checks
average arrow-processing time below 200 ms across 1,200 cards on the development
machine, not on TV hardware.

## Release and repository state

- Main branch: `main`; version source: [version.properties](../version.properties).
- Initial app version: `1.0.0`, Android version code `1`.
- [CI](../.github/workflows/ci.yml) runs app, navigation and release-tool checks.
- [Release workflow](../.github/workflows/release.yml) reuses those checks, requires
  a private repo and a tag on main history, checks increasing version codes,
  verifies signing identity, and attaches a signed APK and SHA-256 to a draft.
- The local debug APK is not release-signed. Moving to the release key requires
  uninstalling that debug installation once, which deletes its local app data.
- Signing bootstrap: [setup-signing.ps1](../scripts/setup-signing.ps1). It keeps
  the encrypted key and DPAPI-protected password outside the repository.
- Live Actions results, signing-secret availability and the initial release must
  be checked in GitHub when continuing; do not infer remote success from the
  presence of workflow files. See the final verification record below.

## Highest-priority next work

1. Install on the actual TCL and run the device checklist in the README.
2. Verify trusted Enter dispatch, Android TV keyboard and fullscreen behavior
   in the TV's actual Android System WebView version.
3. Find an authorized source that loads on the same network; verify playback,
   audio, seeking, subtitle display and pause-on-background on the TV.
4. Test a URL change and restart persistence on-device.
5. Only after those checks, promote a tested draft release. Do not bypass TLS,
   DRM or provider restrictions to make a source work.

## How to continue

Read [MAINTENANCE.md](MAINTENANCE.md) for debugging and selectors, then
[CONTRIBUTING.md](../CONTRIBUTING.md) for commands.
For publication/signing, follow [RELEASING.md](RELEASING.md).
When changing behavior, add a deterministic fixture test and record any remaining
TV-only verification separately. Avoid depending on live provider uptime in CI.

## Final verification record

Local verification on 2026-10-15:

- Debug build, Android unit tests/lint, 15 navigation tests and 6 release-tool
  tests passed.
- Both workflows passed actionlint syntax validation.
- A release build without signing configuration was rejected as intended.
- A release-signed `1.0.0` APK was built and its certificate verified.
- The private GitHub repository and all four signing secrets were created;
  the public certificate fingerprint is pinned in the repository variable.
- Signing certificate SHA-256:
  `cf5fa7d3a860659c70c0dc95af1dbe66984def73323aa696e8dbda3d5a5a97e4`.
- The first [hosted Verify run](https://github.com/iyashwantsaini/cinejoy-tv/actions/runs/38701219701)
  passed on the initial bootstrap commit. It exercised Linux/Chromium fixtures,
  release-tool tests, workflow lint and the Android build/tests/lint.
- A runtime-deprecation notice prompted updating the Gradle/artifact Actions to
  their Node 24 versions, still pinned to full commit IDs.
- Initial source/workflow push used the authenticated VS Code Git integration.
  GitHub CLI access is available for repository, secret and Actions operations;
  CLI workflow-file pushes may separately need the `workflow` OAuth scope.
- The first draft release is not yet verified at this checkpoint. Check its live
  status before claiming end-to-end publication.
