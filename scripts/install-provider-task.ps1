param()
$ErrorActionPreference = 'Stop'
$BridgeDirectory = Split-Path -Parent $PSScriptRoot
$TaskName = 'ZCodeWorkflowBridgeProvider'
$StartScript = Join-Path $BridgeDirectory 'scripts\start-provider.ps1'

$Existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($Existing) {
    Write-Output "Scheduled task '$TaskName' already exists; it will be replaced."
}

$Action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$StartScript`""
$LogonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$WatchdogTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $LogonTrigger, $WatchdogTrigger -Settings $Settings -Force | Out-Null
Write-Output "Registered scheduled task '$TaskName' (starts at logon, health-checks every 5 minutes)."

Start-ScheduledTask -TaskName $TaskName
Write-Output "Started the task; the provider should be ready within a few seconds."
