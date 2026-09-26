# Starts the dev website (8123) and API (5107) hidden in the background — no console window, no browser tab
# popped open. Registered as a Scheduled Task that fires "at log on" (see Tools/register-autostart.ps1), so
# Sportify is just ready at http://localhost:8123 by the time anyone opens a browser to it; nothing to launch
# or babysit. Skips a port that is already serving (Revit's own copy, or a manually started one) rather than
# fighting it for the port.
#
# This is the dev pair (8123/5107), separate from the frozen presentation copy (8124/5108, Sportify_PRESENT) —
# see sportify-presentation-copy in project memory for that one.
$repoRoot = $PSScriptRoot
$apiProject = "C:\Users\Shadow\Documents\Sportify_Revit_and_API\Sportify.Api\Sportify.Api\Sportify.Api.csproj"
$logDir = "$env:LOCALAPPDATA\Sportify\autostart"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Test-Port($port) { [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) }

if (Test-Port 5107) {
    Add-Content "$logDir\autostart.log" "$(Get-Date -Format o)  API already on 5107, left alone"
} else {
    Start-Process -FilePath "dotnet" -ArgumentList @("run", "--project", "`"$apiProject`"", "--urls", "http://localhost:5107") `
        -WorkingDirectory (Split-Path $apiProject) -WindowStyle Hidden `
        -RedirectStandardOutput "$logDir\api.log" -RedirectStandardError "$logDir\api.err.log"
    Add-Content "$logDir\autostart.log" "$(Get-Date -Format o)  API starting on 5107"
}

if (Test-Port 8123) {
    Add-Content "$logDir\autostart.log" "$(Get-Date -Format o)  Website already on 8123, left alone"
} else {
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", "`"$repoRoot\start-sportify.ps1`"", "-NoBrowser") `
        -WorkingDirectory $repoRoot -WindowStyle Hidden `
        -RedirectStandardOutput "$logDir\web.log" -RedirectStandardError "$logDir\web.err.log"
    Add-Content "$logDir\autostart.log" "$(Get-Date -Format o)  Website starting on 8123"
}
