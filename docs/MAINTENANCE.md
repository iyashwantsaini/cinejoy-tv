# Architecture and maintenance

For user installation and controls, see the [README](../README.md). For the latest
work state and limitations, read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md).

## Component map

| Component | Responsibility |
| --- | --- |
| [MainActivity](../app/src/main/java/pk/cinejoy/tv/MainActivity.java) | Native TV toolbar/dialogs, WebView policy, remote dispatch, lifecycle, fullscreen and file picker |
| [SettingsActivity](../app/src/main/java/pk/cinejoy/tv/SettingsActivity.java) | Persisted website URL and explicit site-data reset |
| [SiteUrl](../app/src/main/java/pk/cinejoy/tv/SiteUrl.java) | HTTPS validation, normalization and origin equality |
| [TvUi](../app/src/main/java/pk/cinejoy/tv/TvUi.java) | Shared native text/button styling and focus appearance |
| [tv-navigation.js](../app/src/main/assets/tv-navigation.js) | DOM focus, spatial scoring, input actions, movie-player adaptation and frame routing |
| [navigation.spec.cjs](../tests/navigation.spec.cjs) | Offline browser fixtures for the remote behavior |
| [SiteUrlTest](../app/src/test/java/pk/cinejoy/tv/SiteUrlTest.java) | URL and origin tests |
| [version.properties](../version.properties) | Android version name and monotonically increasing version code |
| [release.mjs](../scripts/release.mjs) | Release-tag checks, changelog extraction and artifact checksums |

There is no app-owned catalogue database, API credential, proxy server, backend,
Media3/ExoPlayer instance or content downloader. Site accounts, lists, stream
selection, source availability and subtitle loading remain the website's work.

## Input and message flow

1. Native toolbar/settings use Android's focus system.
2. When browsing, MainActivity maps arrows and media keys to commands on
   `window.CinejoyTV`.
3. Short OK and native Fullscreen first arm an action, then dispatch Android Enter
   down/up events to WebView. This is deliberate: Chromium requires trusted user
   activation for fullscreen and file pickers. A plain script click is not an
   equivalent replacement.
4. The adapter scores candidates geometrically, focuses the best target and
   scrolls it into view. A green outline marks the selection.
5. Text inputs and selects emit a native-UI request with a temporary field token.
   The native result is JSON-encoded and delivered back to the same field. Stale
   tokens are rejected with a visible message.
6. Inside an iframe, navigation is sent to the injected child script by
   `postMessage`. Receivers verify the source is a parent or actual child window.
   Back unwinds a frame instead of trapping the remote.

### Commands

The adapter's public entry is `CinejoyTV.command(name, args)`. Main commands:

- `focus`, `blur`, `up`, `down`, `left`, `right`, `activate`, `back`.
- `arm` with `{name: "activate" | "fullscreen"}` for the trusted keyboard path.
- `playPause`, `play`, `pause`, `rewind`, `forward`, `fullscreen`, `pauseAll`.
- `servers`, `subtitles`, `settings` for movie-player menus.
- `text` with `{token, value}` and `select` with `{token, index}` for native input.

Native messages are JSON objects with a `type`:

- `toolbar`: move focus to native app controls.
- `back`: request native history/exit handling.
- `message`: show a bounded informational/error message.
- `edit`: field token, value, input type and label.
- `select`: field token, selected index and options.

The native `TvShell` message listener accepts only the configured **top-level
origin**. Frame scripts do not receive an unrestricted native bridge. There is no
`addJavascriptInterface`, arbitrary URL-opening command, file read or shell access.
Preserve that boundary when adding features.

## Site-dependent assumptions

Generic navigation uses semantic links, buttons, form fields, roles and tabindex.
These movie-player adapters depend on the inspected DOM and should be checked
first after a site redesign:

| Assumption | Purpose |
| --- | --- |
| `.player-root[role="application"]` | Find the inspected HTML5 movie player |
| Buttons labeled `Servers`, `Subtitles`, `Settings`, `Back` | Open player menus and keep control bars visible |
| `.settings-popover` | Recognize the player settings/subtitle popup |
| `.menu-back-btn` | Unwind nested player menus |
| Active menu trigger class `scale-105` | Close the current settings/subtitle popup |
| Range label `Seek Video` | Apply 10-second steps when the timeline uses `step="any"` |
| Standard `<video>` and its seekable ranges | Control playback and clamp seek actions |

Never depend on hashed Svelte class names. A domain change alone should not
require code changes; origin and URL settings are independent of these selectors.
Do not copy the website's application bundles into this repository.

### Non-obvious cases already fixed

- `input.stepUp()` throws for `step="any"`; the timeline needs explicit stepping.
- Some language rows contain a nested Translate button. Excluding every parent
  button with child controls makes those languages unreachable.
- Subtitle-upload labels wrap a hidden file input and may not have `for=`.
- Player menus animate. Wait for the visible slide's opacity, not just a nonzero
  bounding box, before asserting focus in live inspections.
- Fading player controls must be revealed after remote activity, without forcing
  unrelated website overlays to remain visible.
- Back must unwind a submenu before fullscreen/history.
- Double OK supports the site's double-click custom-speed control.
- Reinjecting the adapter must not attach duplicate event handlers.

## A safe site-change investigation

1. Record the failing page, selected server, TV model, Android version, WebView
   version and exact remote sequence. Do not record session cookies or passwords.
2. Determine whether a normal browser on the same network can load the source.
   A broken provider is not necessarily a navigation bug.
3. Inspect rendered DOM/accessibility roles, not just the initial HTML. The site
   is a client-rendered JavaScript application.
4. Find the failing selector, candidate exclusion, focus transition or message.
   Change the narrow adapter rather than replacing the whole browser shell.
5. Add a small synthetic fixture reproducing the DOM/interaction shape. Do not
   include actual movies, subtitle text, private page content or provider tokens.
6. Run targeted tests, then the combined app/navigation checks. On-device behavior
   still needs a separate TV check.
7. Update this document if selectors/contracts changed, and update the handoff
   with what was actually verified.

## Debugging on the TV

With authorized ADB debugging enabled on a trusted local network:

```powershell
adb devices
adb shell dumpsys webviewupdate
adb logcat -s CinejoyTV chromium
```

The debug APK enables WebView debugging. Desktop Chrome's `chrome://inspect`
can inspect a connected debug WebView. The release APK does not enable this.
Do not publish raw logs containing website session data or authenticated URLs.
Disable TV debugging when finished.

Useful distinctions:

- **Top-level load error**: native error panel, Retry and URL settings remain usable.
- **Provider/video failure**: page may load while its media source does not;
  inspect website player errors and actual video readiness.
- **Old WebView**: main-page injection may work while document-start frame
  injection is unavailable; update WebView before changing frame logic.
- **No keyboard/file picker**: Android TV integration, not necessarily HTML focus.
- **Pointer/canvas-only provider**: semantic navigation cannot manufacture hidden
  accessibility information. Record the provider limitation instead of promising
  universal support.

## State and compatibility

Settings use app-private SharedPreferences. A URL change recreates WebView and
its origin-bound messaging. Website cookies/storage remain origin-specific.
The clear-data action is intentionally destructive and requires confirmation.

The app is TV-only, landscape, hardware accelerated and needs only Internet
permission. HTTPS/TLS checks remain enabled. Do not request broad storage,
microphone or camera access just to work around a provider error.

The original website icon is an explicitly requested branding asset, not an
affiliation claim. Provenance and checksum are recorded in the README.
