# Edit the two paths below to match where you cloned ai-job-search.
$action = New-ScheduledTaskAction -Execute "C:\Windows\py.exe" -Argument '"C:\path\to\ai-job-search\job_scraper\daily_scrape.py"'
$trigger = New-ScheduledTaskTrigger -Daily -At 08:57
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName "AI Job Search Daily Scrape" -Action $action -Trigger $trigger -Settings $settings -Description "Scrapes job portals daily via ai-job-search CLIs; report lands in job_scraper\reports" -Force *> "C:\path\to\ai-job-search\job_scraper\task_install_log.txt"
