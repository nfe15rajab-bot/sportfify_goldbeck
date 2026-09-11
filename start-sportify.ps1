# Serves this folder over http://localhost and opens it in the default
# browser. Pure PowerShell/.NET — nothing to install, nothing to compile.
$root = $PSScriptRoot

function Try-Listen([int]$port) {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("http://localhost:$port/")
    try { $l.Start(); return $l } catch { return $null }
}

$port = 8123
$listener = Try-Listen $port
if (-not $listener) {
    $port = Get-Random -Minimum 9000 -Maximum 9999
    $listener = Try-Listen $port
}
if (-not $listener) {
    Write-Host "Couldn't start the local server (port busy). Close other Sportify windows and try again."
    Read-Host "Press Enter to exit"
    exit 1
}

$url = "http://localhost:$port/"
Write-Host "Sportify is running at $url"
Write-Host "Opening it in your default browser..."
Write-Host ""
Write-Host "Keep this window open while you use Sportify."
Write-Host "Close it (or press Ctrl+C) to stop the server."

Start-Process $url

$mime = @{
    ".html" = "text/html; charset=utf-8"; ".js" = "application/javascript; charset=utf-8"
    ".css" = "text/css; charset=utf-8"; ".json" = "application/json; charset=utf-8"
    ".png" = "image/png"; ".jpg" = "image/jpeg"; ".jpeg" = "image/jpeg"
    ".svg" = "image/svg+xml"; ".ico" = "image/x-icon"
    ".woff" = "font/woff"; ".woff2" = "font/woff2"
}
$rootFull = [System.IO.Path]::GetFullPath($root)

while ($listener.IsListening) {
    try { $ctx = $listener.GetContext() } catch { break }
    try {
        $path = $ctx.Request.Url.AbsolutePath
        if ($path -eq "/") { $path = "/index.html" }
        $relative = $path.TrimStart("/") -replace "/", [System.IO.Path]::DirectorySeparatorChar
        $full = [System.IO.Path]::GetFullPath((Join-Path $rootFull $relative))

        if ($full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path $full -PathType Leaf)) {
            $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
            $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
            $bytes = [System.IO.File]::ReadAllBytes($full)
            $ctx.Response.ContentLength64 = $bytes.Length
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $ctx.Response.StatusCode = 404
        }
    } catch {
        try { $ctx.Response.StatusCode = 500 } catch {}
    } finally {
        try { $ctx.Response.OutputStream.Close() } catch {}
    }
}
