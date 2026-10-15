# Private repository and APK releases

Repository: [iyashwantsaini/cinejoy-tv](https://github.com/iyashwantsaini/cinejoy-tv).
Keep it **private**, including release assets. Making it public is a separate
decision requiring explicit approval.

## Pipeline

1. Push to `main` or open a PR: [Verify](../.github/workflows/ci.yml) runs release
   tooling tests, browser fixtures, Android build, Java tests and Android lint.
2. Push a version tag: [Release APK](../.github/workflows/release.yml) reruns Verify.
3. The release job requires a private repository, a tag matching
   [version.properties](../version.properties), a matching changelog entry, a
   commit reachable from `origin/main`, and a version code higher than older tags.
4. The job restores the release key only into the runner's temporary directory,
   builds a signed APK, and verifies its signing certificate against a pinned hash.
5. It packages `Cinejoy-TV-vVERSION.apk` and its SHA-256 file into a **draft GitHub
   release**. Published releases are never overwritten. A retry can update an
   existing unpublished draft.
6. Complete the TV checklist and promote the draft manually.

Actions are pinned to full commit IDs. Verification has read-only repository
permissions and no signing secrets. Only the release job has `contents: write`.
Verification reports are retained for seven days. No APK is published to a
public file host or app store.

## Signing identity: never replace it casually

The app ID and signing certificate determine Android update compatibility.
Incrementing a version number does not allow a different key to update an
existing app.

- The initial local debug APK uses Android's debug key.
- GitHub releases use a separate, persistent release key.
- Switching from the debug APK to the release APK requires one uninstall,
  deleting app-local settings/site data. Subsequent release APKs should install
  with `adb install -r` if the key is unchanged and version code increases.
- Never generate a fresh release key per build.
- Never put keys, passwords, base64 secrets or signing configuration containing
  secrets into Git, release assets, logs or chat.
- Recreating the repository's secrets should reuse the original key.

### One-time bootstrap on this Windows machine

Authenticate GitHub CLI with repository and workflow access:

```powershell
gh auth login --hostname github.com --git-protocol https --web
gh auth refresh --hostname github.com --scopes workflow
gh repo view iyashwantsaini/cinejoy-tv --json isPrivate,viewerPermission
.\scripts\setup-signing.ps1 -Repository iyashwantsaini/cinejoy-tv
```

The script requires PowerShell 7, JDK `keytool`, authenticated repository-admin
access and a private repository. It generates a 4096-bit RSA PKCS12 key only if
no local identity already exists. Passwords are random and never printed or
passed on process command lines. Secret uploads use stdin without a trailing
newline. Re-running it uploads the existing identity rather than rotating it.

Local files, outside the repository:

```text
%LOCALAPPDATA%\CinejoyTV\signing\release.p12
%LOCALAPPDATA%\CinejoyTV\signing\password.clixml
%LOCALAPPDATA%\CinejoyTV\signing\release-cert.der
```

The CLIXML password is encrypted with Windows DPAPI. It is tied to this Windows
user/profile and is **not a portable password backup**. Store the PKCS12 key and
its password in a trusted password manager/offline backup before replacing the
machine or Windows profile. Do not treat copying only `password.clixml` to
another computer as recovery. GitHub secrets cannot be read back through the UI.

The DER certificate is public and can be backed up or used for fingerprint
verification without exposing the private key.

### GitHub settings

The bootstrap sets these **Actions repository secrets**:

| Name | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64 of the persistent PKCS12 key |
| `ANDROID_KEYSTORE_PASSWORD` | Key-store password |
| `ANDROID_KEY_ALIAS` | `cinejoy-tv-release` |
| `ANDROID_KEY_PASSWORD` | Private-key password |

And this **Actions repository variable**:

| Name | Value |
| --- | --- |
| `ANDROID_SIGNING_CERT_SHA256` | SHA-256 of the DER certificate, 64 hex characters |

Check names/configuration without printing secret values:

```powershell
gh secret list --repo iyashwantsaini/cinejoy-tv
gh variable list --repo iyashwantsaini/cinejoy-tv
```

The current account's plan rejected private-repository branch protection with
HTTP 403 on 2026-10-15. The repository was kept private; no plan upgrade or
visibility change was made. Therefore required PR checks and tag protection are
not currently enforced by a repository ruleset.

On a plan supporting private-repo protection, require the `Android and navigation
checks` check for PR merges, disable force pushes/deletions on main, and protect
release tags. Until then, use PRs and green checks as the development policy.
The release workflow itself still reruns verification and checks main ancestry
before accessing the signing key, regardless of branch-protection availability.

## Cut a release

1. Update `VERSION_NAME` and increment `VERSION_CODE` in `version.properties`.
   Names use `major.minor.patch` or a prerelease such as `1.1.0-rc.1`.
   Version codes must increase across **all** version tags, including prereleases.
2. Add the version's entry to [CHANGELOG.md](../CHANGELOG.md), including limitations.
3. Run the checks in [CONTRIBUTING.md](../CONTRIBUTING.md), commit and push main.
4. Wait for Verify to pass, then tag that committed version:

```powershell
git tag -a v1.0.0 -m "Cinejoy TV 1.0.0"
git push origin v1.0.0
gh run list --repo iyashwantsaini/cinejoy-tv --workflow release.yml --limit 5
```

Use the intended new version rather than reusing `v1.0.0` once it exists.
Do not move a tag to fix a published release. Create a new version/code instead.

5. Download the draft APK while authenticated:

```powershell
gh release download v1.0.0 --repo iyashwantsaini/cinejoy-tv --dir .\dist --pattern "*.apk*"
Get-FileHash .\dist\Cinejoy-TV-v1.0.0.apk -Algorithm SHA256
```

Compare against the attached `.sha256` file. Install on the TCL and test remote
navigation, keyboard, playback, server switching, subtitles, fullscreen/Back,
URL persistence and backgrounding. Record device and WebView versions.

6. Only when satisfied, publish the draft:

```powershell
gh release edit v1.0.0 --repo iyashwantsaini/cinejoy-tv --draft=false
```

Publication within this private repository still requires repository access.
It does not certify providers or eliminate the documented WebView limitations.

## Local release build

Provide these process-scoped environment variables using your secure credential
workflow; do not type passwords into a committed script:

```text
ANDROID_KEYSTORE_FILE
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

Then:

```powershell
.\gradlew.bat :app:assembleRelease --no-daemon --no-configuration-cache
& "$env:ANDROID_HOME\build-tools\35.0.0\apksigner.bat" verify --verbose --print-certs `
    .\app\build\outputs\apk\release\app-release.apk
node .\scripts\release.mjs package .\app\build\outputs\apk\release\app-release.apk
```

The Gradle build refuses a release when signing configuration is missing. The
packaging script alone does **not** verify an Android signature; signature and
certificate verification must precede it, as the workflow does.

## Failure and recovery

| Failure | Correct response |
| --- | --- |
| GitHub login invalid | Reauthenticate `gh`; never commit a token as a workaround |
| Push rejected for workflow scope | `gh auth refresh --hostname github.com --scopes workflow`, then retry |
| Missing signing secret | Rerun bootstrap using the original local identity |
| Certificate mismatch | Stop; compare the intended original certificate, do not just change the pin |
| Tag/version mismatch | Fix version/changelog before tagging; do not repoint published tags |
| Code not increasing | Increment `VERSION_CODE`, including after prereleases |
| Tag not on main history | Merge the intended changes to main before tagging |
| Verification failure | Fix the cause; do not disable tests or weaken release gates |
| Draft upload interrupted | Rerun the failed release workflow; only drafts can be updated |
| Published APK is broken | Ship a higher-code fix; installed newer versions cannot safely downgrade |
| Signing password/profile lost | Recover the original backed-up identity; a new key breaks in-place updates |

If a release is cancelled, the key cleanup step is attempted and the hosted
runner is discarded. Keys are never included in verification artifacts or caches.
