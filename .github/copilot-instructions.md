# Cinejoy TV project context

This repository is a **private**, personal Android TV app for a TCL TV. Preserve
the user's remote-only navigation, editable website URL and original website
icon. Do not make the repository or its releases public without explicit approval.

## Start here

- Read [the current handoff](../docs/PROJECT_CONTEXT.md) before planning changes.
  It records completed work, verification limits and remaining device checks.
- Consult [maintenance and architecture](../docs/MAINTENANCE.md) for component
  boundaries, message contracts and site-change debugging.
- Use [the release runbook](../docs/RELEASING.md) for signing, versions and releases.
- Keep the handoff current after meaningful changes, separating verified facts
  from assumptions. Avoid duplicating the full README in these instructions.

## Architecture and boundaries

- Java 17 Android app, minimum API 23, compile/target API 35, Gradle 8.11.1 / AGP 8.9.2.
- Native shell/settings/text entry around the actual website in Android WebView.
  This is **not** a native catalogue backend or independent streaming service.
- MainActivity dispatches remote keys; `app/src/main/assets/tv-navigation.js`
  handles spatial focus, player menus and cross-origin frame navigation.
- The selected HTTPS origin is user-configurable. Do not hardcode future domains
  into player logic, weaken TLS checks, expose a JavaScript file-system bridge,
  or allow arbitrary native actions from frames.
- Fullscreen/file selection use trusted keyboard activation. Preserve the `arm`
  command followed by Android Enter events, rather than replacing it with an
  untrusted `evaluateJavascript` click.
- Preserve the website icon/banner and `pk.cinejoy.tv` application ID.
- Runtime version information lives in `version.properties`. Release keys,
  passwords, APKs and local SDK settings must stay out of Git.

## Checks

From PowerShell:

```powershell
.\gradlew.bat :app:assembleDebug :app:testDebugUnitTest :app:lintDebug --no-daemon
npm test
node --test .\scripts\release.test.mjs
```

Use `npm ci` only when dependencies need restoring. Windows tests default to
installed Edge; Linux CI installs the Playwright-pinned Chromium. Workflow
changes should also pass actionlint. See CONTRIBUTING.md for setup details.

## Known limits to preserve in reports

- Desktop browser fixtures validate navigation, not TCL hardware or codec support.
- The initial live movie inspection verified menus but its video remained at
  `readyState = 0`; successful live streaming was not established.
- Initial source validation had 15 browser tests and 3 Java tests; release tooling
  adds its own Node tests. Run the tests instead of assuming counts remain fixed.
- Website/player DOM changes may need an adapter update. A domain-only move
  should require only the app's URL setting.
- Releases are signed with a separate persistent key and created as **drafts**.
  Do not promote a draft or claim device playback works without device evidence.
