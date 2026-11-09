<#
.SYNOPSIS
  Runs the offline simulator. Uses Node.js if installed, otherwise the Node
  runtime bundled inside VS Code (no install needed).

.EXAMPLE
  .\test\run.ps1 20000
  .\test\run.ps1 60000 --fast 25
  .\test\run.ps1 15000 --reset-every 500 --invader-at 9000 --legacy
  .\test\run.ps1 plan        # ASCII render of the base plan
#>
param([Parameter(ValueFromRemainingArguments = $true)] $SimArgs)

$script = Join-Path $PSScriptRoot 'sim.js'
if ($SimArgs -and $SimArgs[0] -eq 'plan') {
  $script = Join-Path $PSScriptRoot 'plan_ascii.js'
  $SimArgs = @()
}

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  & $node.Source $script @SimArgs
  exit $LASTEXITCODE
}

$code = Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\Code.exe'
if (-not (Test-Path $code)) {
  Write-Error 'Neither node nor VS Code found. Install Node.js from https://nodejs.org'
  exit 1
}
$env:ELECTRON_RUN_AS_NODE = '1'
# Code.exe is a GUI-subsystem exe: piping makes PowerShell wait and show output.
& $code $script @SimArgs | Write-Output
$rc = $LASTEXITCODE
Remove-Item Env:ELECTRON_RUN_AS_NODE
exit $rc
