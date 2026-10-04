param()
$ErrorActionPreference = 'Stop'
$BridgeDirectory = Split-Path -Parent $PSScriptRoot
$ConfigPath = Join-Path $BridgeDirectory '.bridge/config/native-provider.json'
if (-not (Test-Path -LiteralPath $ConfigPath)) { $ConfigPath = Join-Path $BridgeDirectory 'config/native-provider.json' }
$Config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
try {
    $Health = Invoke-RestMethod -Uri "http://127.0.0.1:$($Config.port)/health" -TimeoutSec 2
    if ($Health.service -eq 'agent-bridge' -and $Health.ready) {
        Write-Output "Provider is already running on port $($Config.port)."
        exit 0
    }
    throw 'Another service is using the provider port.'
} catch {
    if ($_.Exception.Message -eq 'Another service is using the provider port.') { throw }
}
$StateDirectory = Join-Path $BridgeDirectory '.bridge/provider'
New-Item -ItemType Directory -Path $StateDirectory -Force | Out-Null
$RunStamp = [guid]::NewGuid().ToString()
$NodeExecutable = (Get-Command node -CommandType Application | Select-Object -First 1).Source
$Process = Start-Process -FilePath $NodeExecutable -ArgumentList 'bin/provider.mjs' -WorkingDirectory $BridgeDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $StateDirectory "server-$RunStamp.stdout.log") -RedirectStandardError (Join-Path $StateDirectory "server-$RunStamp.stderr.log")
for ($Attempt = 0; $Attempt -lt 30; $Attempt++) {
    if ($Process.HasExited) { throw "Provider exited. Check .bridge/provider/server-$RunStamp.stderr.log" }
    try {
        $Health = Invoke-RestMethod -Uri "http://127.0.0.1:$($Config.port)/health" -TimeoutSec 1
        if ($Health.service -eq 'agent-bridge' -and $Health.ready) {
            Write-Output "Provider ready on port $($Config.port); PID $($Process.Id)."
            exit 0
        }
    } catch { }
    Start-Sleep -Milliseconds 200
}
throw "Provider did not become ready; inspect PID $($Process.Id) and .bridge/provider/server-$RunStamp.stderr.log"
