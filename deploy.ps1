<#
.SYNOPSIS
  Copies src/*.js into the Screeps client's script folder for a server.
  The Screeps client watches that folder and uploads changes automatically.

.EXAMPLE
  .\deploy.ps1                              # local server (127.0.0.1:21025), branch "default"
  .\deploy.ps1 -Server screeps.com          # official server
#>
param(
  [string]$Server = '127_0_0_1___21025',
  [string]$Branch = 'default'
)

$src = Join-Path $PSScriptRoot 'src'
$dest = Join-Path $env:LOCALAPPDATA "Screeps\scripts\$Server\$Branch"

if (-not (Test-Path $dest)) {
  Write-Error "Target folder not found: $dest  (connect to that server once in the Screeps client first)"
  exit 1
}

$files = Get-ChildItem $src -Filter *.js
$names = $files | ForEach-Object { $_.Name }

# Remove modules that no longer exist in src (otherwise they'd linger on the server).
Get-ChildItem $dest -Filter *.js | Where-Object { $names -notcontains $_.Name } | ForEach-Object {
  Remove-Item $_.FullName -Confirm:$false
  Write-Host "removed  $($_.Name)"
}

$files | ForEach-Object { Copy-Item $_.FullName $dest -Force }
Write-Host "Deployed $($files.Count) modules to $dest"
