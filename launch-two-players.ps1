# Starts the Vite dev server (if it isn't already running) and opens two
# browser tabs against it, for testing the local host/join multiplayer flow
# described in README.md ("Try the local-mode flow"): host a table in one
# tab, join with the invite code in the other. Both tabs share the same
# browser's localStorage, which is what local demo mode relies on.

$port = 5173
$url = "http://localhost:$port"
$logPath = Join-Path $PSScriptRoot "vite-dev.log"

$listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue

if (-not $listening) {
    Write-Host "[dev:duo] Starting dev server on port $port (output logged to $logPath)..."
    Remove-Item $logPath -ErrorAction SilentlyContinue
    # Explicitly "npm.cmd", not "npm" - Start-Process resolves the bare name
    # via PATHEXT, which can land on npm.ps1 instead. PowerShell's default
    # action for a .ps1 file is "Edit", not "Run", so that silently opens
    # the script in Notepad instead of executing it: no error, no output,
    # and the "process" (Notepad) never exits within the wait loop below.
    $proc = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev" -WindowStyle Minimized `
        -RedirectStandardOutput $logPath -RedirectStandardError "$logPath.err" -PassThru

    $ready = $false
    for ($i = 1; $i -le 30; $i++) {
        if ($proc.HasExited) {
            Write-Host "[dev:duo] ERROR: npm process exited early (exit code $($proc.ExitCode))." -ForegroundColor Red
            break
        }
        try {
            Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1 | Out-Null
            $ready = $true
            Write-Host "[dev:duo] Server responded after ${i}s - confirmed running." -ForegroundColor Green
            break
        } catch {
            Write-Host "[dev:duo] Waiting for server... (${i}s)"
            Start-Sleep -Seconds 1
        }
    }

    if (-not $ready) {
        Write-Host "[dev:duo] ERROR: dev server did not respond within 30s. Not opening browser tabs." -ForegroundColor Red
        Write-Host "[dev:duo] --- Last output from $logPath ---" -ForegroundColor Yellow
        Get-Content $logPath -ErrorAction SilentlyContinue -Tail 30
        Write-Host "[dev:duo] --- Last output from $logPath.err ---" -ForegroundColor Yellow
        Get-Content "$logPath.err" -ErrorAction SilentlyContinue -Tail 30
        exit 1
    }
} else {
    Write-Host "[dev:duo] Dev server already running on port $port - confirmed via existing listener." -ForegroundColor Green
}

Start-Process $url
Start-Process $url

Write-Host "[dev:duo] Opened two tabs at $url - host a table in one, then Join with its invite code in the other." -ForegroundColor Green
