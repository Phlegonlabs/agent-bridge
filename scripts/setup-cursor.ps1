param()
$ErrorActionPreference = 'Stop'
if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') {
    throw 'This pinned package is for Windows x64.'
}
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$packageVersion = '2026.09.18-9a7762b'
$targetDirectory = Join-Path $repositoryRoot ".bridge\tools\cursor-$packageVersion"
$entryFile = Join-Path $targetDirectory 'dist-package\index.js'
if (Test-Path -LiteralPath $entryFile) {
    Write-Output "Existing package preserved: $entryFile"
    exit 0
}
if (Test-Path -LiteralPath $targetDirectory) {
    throw "Target already exists; preserving it: $targetDirectory"
}
New-Item -ItemType Directory -Path $targetDirectory | Out-Null
$zipPath = Join-Path $targetDirectory 'package.zip'
Invoke-WebRequest -Uri "https://downloads.cursor.com/lab/$packageVersion/windows/x64/agent-cli-package.zip" -OutFile $zipPath -TimeoutSec 60
$expectedHash = '9C1FBCDA9F0A39667689A6A3146B549FFEC465CAF47723E0A7BB345142D5BDE4'
if ((Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash -ne $expectedHash) {
    throw 'Downloaded package differs from the package verified for this bridge.'
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipArchive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $targetPrefix = [System.IO.Path]::GetFullPath($targetDirectory) + '\'
    foreach ($entry in $zipArchive.Entries) {
        $resolvedTarget = [System.IO.Path]::GetFullPath((Join-Path $targetDirectory $entry.FullName))
        if (-not $resolvedTarget.StartsWith($targetPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw 'Archive path escapes the package directory.'
        }
    }
} finally { $zipArchive.Dispose() }
[System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $targetDirectory)
Write-Output "Cursor package ready: $entryFile"
