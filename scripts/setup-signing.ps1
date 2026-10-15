[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')]
    [string]$Repository
)

$ErrorActionPreference = 'Stop'
if (-not $IsWindows) {
    throw 'Run this one-time bootstrap in PowerShell 7 on Windows; it uses Windows DPAPI for local password storage.'
}
foreach ($tool in @('gh', 'keytool')) {
    Get-Command $tool -ErrorAction Stop | Out-Null
}
$repositoryInfo = gh repo view $Repository --json isPrivate,viewerPermission | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'GitHub authentication or repository lookup failed.' }
if (-not $repositoryInfo.isPrivate -or $repositoryInfo.viewerPermission -ne 'ADMIN') {
    throw 'Signing setup requires an administrator of the intended private repository.'
}

function Set-RepositorySecret([string]$Name, [string]$Value) {
    $start = [System.Diagnostics.ProcessStartInfo]::new((Get-Command gh).Source)
    $start.UseShellExecute = $false
    $start.RedirectStandardInput = $true
    foreach ($argument in @('secret', 'set', $Name, '--repo', $Repository)) {
        $start.ArgumentList.Add($argument)
    }
    $process = [System.Diagnostics.Process]::Start($start)
    try {
        # Write without a trailing newline, which would change a signing password.
        $process.StandardInput.Write($Value)
        $process.StandardInput.Close()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) { throw "Uploading $Name failed." }
    } finally {
        $process.Dispose()
    }
}

$directory = Join-Path $env:LOCALAPPDATA 'CinejoyTV\signing'
$keystore = Join-Path $directory 'release.p12'
$passwordFile = Join-Path $directory 'password.clixml'
$certificate = Join-Path $directory 'release-cert.der'
$alias = 'cinejoy-tv-release'
$keyExists = Test-Path -LiteralPath $keystore
$passwordExists = Test-Path -LiteralPath $passwordFile
if ($keyExists -ne $passwordExists) {
    throw 'Incomplete existing signing identity. Restore the original key/password; do not generate a replacement.'
}

New-Item -ItemType Directory -Force -Path $directory | Out-Null
if ($keyExists) {
    $securePassword = Import-Clixml -LiteralPath $passwordFile
    if ($securePassword -isnot [System.Security.SecureString]) { throw 'Invalid protected password file.' }
} else {
    $bytes = [byte[]]::new(48)
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes) } finally { $random.Dispose() }
    $securePassword = ConvertTo-SecureString ([Convert]::ToBase64String($bytes)) -AsPlainText -Force
    [Array]::Clear($bytes, 0, $bytes.Length)
}

$oldStorePassword = $env:ANDROID_KEYSTORE_PASSWORD
$oldKeyPassword = $env:ANDROID_KEY_PASSWORD
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $env:ANDROID_KEYSTORE_PASSWORD = $password
    $env:ANDROID_KEY_PASSWORD = $password
    if (-not $keyExists) {
        $securePassword | Export-Clixml -LiteralPath $passwordFile
        & keytool -genkeypair -keystore $keystore -storetype PKCS12 -alias $alias `
            -keyalg RSA -keysize 4096 -validity 10000 -dname 'CN=Cinejoy TV' `
            -storepass:env ANDROID_KEYSTORE_PASSWORD -keypass:env ANDROID_KEY_PASSWORD -noprompt
        if ($LASTEXITCODE -ne 0) {
            Remove-Item -LiteralPath $passwordFile
            if (Test-Path -LiteralPath $keystore) { Remove-Item -LiteralPath $keystore }
            throw 'Key generation failed; no signing identity was uploaded.'
        }
    }
    & keytool -exportcert -keystore $keystore -alias $alias -file $certificate `
        -storepass:env ANDROID_KEYSTORE_PASSWORD
    if ($LASTEXITCODE -ne 0) { throw 'Could not validate the existing signing identity.' }
    $fingerprint = (Get-FileHash -LiteralPath $certificate -Algorithm SHA256).Hash.ToLowerInvariant()

    Set-RepositorySecret 'ANDROID_KEYSTORE_BASE64' ([Convert]::ToBase64String([IO.File]::ReadAllBytes($keystore)))
    Set-RepositorySecret 'ANDROID_KEYSTORE_PASSWORD' $password
    Set-RepositorySecret 'ANDROID_KEY_ALIAS' $alias
    Set-RepositorySecret 'ANDROID_KEY_PASSWORD' $password
    gh variable set ANDROID_SIGNING_CERT_SHA256 --repo $Repository --body $fingerprint
    if ($LASTEXITCODE -ne 0) { throw 'Could not pin the signing certificate in GitHub.' }

    Write-Output "Signing identity configured for private repository $Repository."
    Write-Output "Local encrypted key and DPAPI-protected password: $directory"
    Write-Output "Public certificate SHA-256: $fingerprint"
    Write-Warning 'Keep a secure, portable backup of the keystore AND password. The CLIXML password is tied to this Windows user/profile.'
} finally {
    $env:ANDROID_KEYSTORE_PASSWORD = $oldStorePassword
    $env:ANDROID_KEY_PASSWORD = $oldKeyPassword
    $password = $null
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $securePassword.Dispose()
}
