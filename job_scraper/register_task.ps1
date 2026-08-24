param(
    [string]$At = "08:00",
    [string]$TaskName = "UK Job Search Daily Scrape"
)

$jobSearchPython = (Get-Command py.exe -ErrorAction Stop).Source
$jobSearchScript = Join-Path $PSScriptRoot "daily_scrape.py"
$jobSearchLog = Join-Path $PSScriptRoot "task_install_log.txt"

$action = New-ScheduledTaskAction -Execute $jobSearchPython -Argument "`"$jobSearchScript`""
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Runs the configured UK job searches and writes a private daily report." `
    -Force *> $jobSearchLog

Write-Host "Registered '$TaskName' at $At using $jobSearchScript"
