# Development

Start with [project context](docs/PROJECT_CONTEXT.md) and
[maintenance/architecture](docs/MAINTENANCE.md).
This repository remains private. Open it as the workspace folder in VS Code so
Copilot can discover [.github/copilot-instructions.md](.github/copilot-instructions.md).
No second AGENTS.md or duplicate context file is required.

## Toolchain

- JDK 17.
- Android SDK platform 35 and Build Tools 35.0.0; set `ANDROID_HOME`.
- The included Gradle 8.11.1 wrapper; do not require a global Gradle install.
- Node.js 22 and `npm ci` for the locked browser-test dependencies.
- Microsoft Edge on Windows. Linux CI installs Playwright's pinned Chromium.
- Git and GitHub CLI for repository/release operations.

Do not commit `local.properties`, generated APKs, signing keys or passwords.

## Checks

```powershell
.\gradlew.bat :app:assembleDebug :app:testDebugUnitTest :app:lintDebug --no-daemon
npm test
node --test .\scripts\release.test.mjs
```

Focused browser test:

```powershell
npx playwright test -g "subtitle"
```

To use installed Chrome instead of Edge for a specific local investigation:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm test
Remove-Item Env:\PLAYWRIGHT_CHANNEL
```

Workflow edits should pass [actionlint](https://github.com/rhysd/actionlint).
With a sufficiently recent Go toolchain:

```powershell
go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.7
```

The local machine initially had an older Go toolchain, so a checksum-verified
standalone actionlint binary was used instead. No Go code is part of this app.

## Change discipline

- Reproduce UI changes with small synthetic browser fixtures. CI must not depend
  on provider uptime or download actual movies/subtitles.
- Keep native/JavaScript message contracts aligned and validate their inputs.
- Preserve trusted activation, HTTPS/origin boundaries and explicit error UI.
- Keep the actual site's features; do not add a native streaming backend without
  a separate design decision.
- Avoid broad DOM selectors or forced styles outside the player controls.
- Include a real TV check for Android keyboard, lifecycle, fullscreen or playback
  claims. Desktop tests alone are not sufficient evidence.
- Update the context/maintenance docs when behavior or known limitations change.
- Follow [RELEASING.md](docs/RELEASING.md) for version changes and signing.

Use feature branches and PRs for later work. Verify should pass before merging;
private-repository branch protection availability depends on the GitHub plan.
