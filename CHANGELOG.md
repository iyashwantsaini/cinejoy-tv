# Changelog

## [Unreleased]

- No additional app changes recorded.

## [1.0.0] - 2026-10-15

- Initial Android TV app with native app menus, settings and saved HTTPS URL.
- Remote-only focus navigation across the live website, movie pages and menus.
- Player/server/subtitle shortcuts, bounded seeking and fullscreen support.
- Native text entry, subtitle selectors, sliders, colors and file-picker integration.
- Original website icon and matching TV banner.
- Private repository CI, persistent release signing, checksums and draft APK releases.

### Verification limits

- Navigation, URL and release-tool tests are automated.
- No physical TCL was connected during initial development.
- Live movie menus were inspected, but the stream did not become ready.
- Device playback, codec support, trusted WebView activation and TV keyboard/file
  picker behavior must be checked on the target TV before promoting a draft.
