# Cinejoy TV

An independent Android TV app for navigating the Cinejoy website with a normal
D-pad remote, without a browser's virtual mouse. Designed for TCL Android TV /
Google TV and other Android TV devices running Android 6.0 or newer.

**This is a native TV shell with an adapted WebView, not a reimplementation of the
website's catalogue or streaming backend.** Settings, app menus, text entry and
file selection are native Android UI. The catalogue, accounts, movie pages,
server selection and subtitles remain the actual website.

## Project documentation

- [Current project context and handoff](docs/PROJECT_CONTEXT.md)
- [Architecture, site-change maintenance and troubleshooting](docs/MAINTENANCE.md)
- [Development and validation](CONTRIBUTING.md)
- [Private signed-release runbook](docs/RELEASING.md)
- [Changelog](CHANGELOG.md)

[Copilot project instructions](.github/copilot-instructions.md) are automatically
discovered by VS Code Copilot when this repository is opened as the workspace.
They include the essential project context and direct future sessions to the
detailed handoff. If instructions are disabled in your VS Code settings or you use
another assistant, open the handoff explicitly.

## Install on the TV

For normal installations, use the signed APK from the private repository's
[GitHub Releases](https://github.com/iyashwantsaini/cinejoy-tv/releases).
Releases start as drafts pending the TV checklist; maintainers can download drafts
while signed in.

The locally built, debug-signed APK is
[dist/Cinejoy-TV-debug.apk](dist/Cinejoy-TV-debug.apk).
The normal Gradle output is
[app/build/outputs/apk/debug/app-debug.apk](app/build/outputs/apk/debug/app-debug.apk).
This is a personal sideload/test build, not a Play Store release.
Release APKs use a different key from this initial debug build; see the release
runbook before switching an existing installation. Local APK links work after
building; binaries are intentionally not committed to Git.

1. Copy the APK to a USB drive, or transfer it with a TV-compatible file-transfer
   app such as Send Files to TV.
2. Open the APK with a file manager on the TCL.
3. If prompted, allow **Install unknown apps** for that file manager. On older TCL
   software this is under **Settings > Security & restrictions > Unknown sources**.
4. Install and open **Cinejoy TV** from the TV's apps screen.
5. Update **Android System WebView** through the TV's Play Store if available.
   Embedded-frame remote navigation depends on the WebView version, not just the
   Android OS version.

You can disable the file manager's unknown-app installation permission afterward.
Keep the same signing key for future app updates; a build signed with a different
key cannot replace this installation without uninstalling it and losing its data.

### Optional ADB installation

If network debugging is enabled on your TV, from a PC on the same local network:

```powershell
adb connect TV_IP:5555
adb install -r .\dist\Cinejoy-TV-debug.apk
adb shell am start -n pk.cinejoy.tv/.MainActivity
```

Some TCL versions instead expose **Wireless debugging** with a pairing port:
use `adb pair TV_IP:PAIRING_PORT`, then `adb connect TV_IP:DEBUG_PORT`.
Only enable debugging on a trusted local network; disable it when finished.

## Remote controls

| Button | Action |
| --- | --- |
| Arrows | Move the green focus outline; automatically scroll shelves and long lists |
| OK | Activate the focused control |
| OK on a text field | Open native text entry and the TV keyboard; choose Apply to update the website |
| Left / Right on a slider | Adjust its value; the movie timeline moves in 10-second steps |
| Up / Down on a slider | Leave the slider for another control |
| Double OK on a button | Send a double-click, including the player's custom-speed shortcut |
| Back | Close a supported player submenu, leave fullscreen, then navigate back; confirm before exiting the app |
| Menu, or hold OK while browsing | Open app controls, including Player and Settings |
| Up at the top of a page | Return to the native app toolbar |
| Play / Pause | Control the current HTML5 video |
| Rewind / Fast-forward | Seek 10 seconds, bounded by the available seekable range |

Choose **Browse**, or press Down from the toolbar, to focus the website.
In an embedded player, OK enters its controls and Back leaves the frame.

### Movie player

The native **Player** menu offers:

- Play / pause and 10-second seeking.
- **Servers**: open the website's server selector.
- **Subtitles**: open language and track selection, including Off.
- **Playback settings**: open quality, audio, speed, zoom and other site settings.
- Fullscreen.

The navigation layer handles the inspected player's fading control bars,
scrolling menus, nested subtitle panels, subtitle search, delay, size, position,
background, preset/custom colors and sliders. It keeps controls visible briefly
after remote activity, instead of requiring mouse movement.

**Upload subtitle file** uses Android's document picker without requesting broad
storage access. A compatible document picker/file manager must exist on the TV.
The site's subtitle input accepts SRT/VTT files. DRM, browser-specific Cast/PiP
features, watch-party services and individual providers may have additional
limitations; these are not replaced with native streaming implementations.

## When the website address changes

1. Open the app's **Settings** from its toolbar or remote menu. This is separate
   from the website's own player/settings button.
2. Enter the new HTTPS address. A bare hostname automatically gets `https://`.
3. Choose **Save and open**.

The address survives restarts. No APK rebuild is needed for a domain-only change.
The app recreates its browser and origin-restricted messaging when the address
changes. Site cookies, favorites and accounts are origin-specific: they are not
automatically copied to another domain. The app's **Clear website data** action
removes local site data and signs you out, but retains the configured address.

Only use addresses you trust. Plain HTTP, embedded credentials and malformed
addresses are rejected. Top-level links to other origins are blocked; enter a
replacement domain in Settings rather than following an advertising redirect.
HTTPS video/CDN resources and embedded players can still load from other origins.

## What was actually checked

On 2026-10-15, the public website was inspected in a desktop browser:

- Home, search and a movie detail page.
- A movie's `/watch/movie/...` page with an HTML5 video element.
- The server menu (Nebula, Lisbon, Solara and Athens), including remote navigation
  and selecting Lisbon.
- Subtitle languages, an English track list, nested Back behavior and subtitle
  customization controls.
- Playback settings, speed presets, zoom, volume-boost and brightness sliders.
- The navigation asset was injected into the live player and used to navigate
  those menus, not just examined in static HTML.

Local validation passed:

- Android debug APK build and Android lint (no lint errors; SDK/dependency-version
  and TV-landscape advisories remain).
- 3 Java unit tests covering address validation, canonicalization and origin
  isolation.
- 15 browser tests covering D-pad navigation, activation, modal focus, scrolling,
  dynamic content, native-input messages, cross-origin frames, media commands,
  subtitle controls, file selection, fullscreen, Back ordering and double OK.
- A 1,200-card fixture checks average arrow-navigation processing stays below
  200 ms on the development machine. This is not a TV hardware benchmark.

**No TCL or Android emulator was connected.** Installation, Android WebView
keyboard/fullscreen behavior, TV keyboard/file-picker integration and actual
video decoding must still be checked on your TV. The inspected live video's
`readyState` remained 0; successful streaming was **not** verified. Provider,
network, codec, DRM or website errors cannot be fixed by a remote-navigation
wrapper. The media tests use a controlled video fixture, not a commercial stream.

### First-run TV checks

1. Move through home rows with arrows only, then open a movie.
2. Open Player > Servers and choose an available source.
3. Test Play, Pause, seeking, fullscreen and Back.
4. Open Subtitles, pick a language/track, change subtitle delay and return with Back.
5. Test search with the TV keyboard, and Settings > Save and open.
6. Close and reopen the app to verify the address was retained.
7. If a provider fails, try another source and check that it also works in a
   normal browser on the same network.

For a blank/unsupported page, update WebView and try Reload. Certificate errors
are deliberately not bypassed; check the TV clock and the site's address.
When a WebView is too old for document-start scripts, main-page navigation still
works, but embedded-frame controls may not. The app displays an update notice.
Canvas-only controls, inaccessible closed shadow DOM, or major site redesigns
can require updates to the navigation adapter.

## Build and test

Requirements: JDK 17, Android SDK platform 35, Android SDK Build Tools, and network
access for Gradle dependencies. Set `ANDROID_HOME` or put `sdk.dir` in an untracked
`local.properties` file. The Gradle wrapper is version-pinned and checksummed.

From PowerShell in the project folder:

```powershell
.\gradlew.bat :app:assembleDebug :app:testDebugUnitTest :app:lintDebug --no-daemon
```

The browser tests need Node.js and Microsoft Edge:

```powershell
npm ci
npm test
node --test .\scripts\release.test.mjs
```

Tests are deterministic and do not contact the live streaming site. No Android
emulator is required for these tests. Android runtime testing is a separate step.

Key implementation files:

- [MainActivity.java](app/src/main/java/pk/cinejoy/tv/MainActivity.java):
  TV shell, lifecycle, remote-key dispatch, menus and WebView restrictions.
- [SettingsActivity.java](app/src/main/java/pk/cinejoy/tv/SettingsActivity.java):
  persistent address and site-data reset.
- [tv-navigation.js](app/src/main/assets/tv-navigation.js):
  spatial focus, trusted keyboard actions, player adapters and frame navigation.
- [SiteUrl.java](app/src/main/java/pk/cinejoy/tv/SiteUrl.java):
  URL validation and origin comparison.

Release versioning, persistent signing and GitHub automation are described in the
[release runbook](docs/RELEASING.md). Release builds refuse to run without explicit
signing configuration; do not commit the key or its passwords.

## Privacy and branding

The app has no analytics, account service or streaming backend of its own.
The website and its providers can still use cookies, analytics and advertising.
Third-party cookies are enabled for player compatibility. Pop-up windows,
downloads, camera/microphone requests and unsolicited external-app navigation
are blocked. Choosing a local file explicitly opens Android's document picker.
TLS validation stays enabled; cleartext and mixed HTTP content are disabled.
Web content has no Java reflection/file-system bridge. Native UI messages are
accepted only from the configured top-level origin.

At the user's request, the launcher uses the website's original
[512-pixel icon](https://cinejoy.pk/pwa-512.png), as advertised in its
[web manifest](https://cinejoy.pk/manifest.json). The TV banner reuses that same
icon. Downloaded icon SHA-256:
`b46c486c90f6b1731dec251d0729453f4f750c0b88b61d9486dd6a6850696d6c`.
The branding belongs to its owner; this is not an official or endorsed app.
No movies, subtitles, streaming credentials or website application code are
bundled. Only access content you are authorized to watch.
