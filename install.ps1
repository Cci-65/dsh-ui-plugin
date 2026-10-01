# install.ps1 - Direct installer for DeepSeek Harness (@local/dsh-ui)
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspaceDir = $scriptDir
$dshHome = Join-Path $env:USERPROFILE ".dsh"
$pluginRoot = Join-Path $dshHome "plugin"
$userDshPluginDir = Join-Path $pluginRoot "dsh-ui"
$oldUserPluginDir = Join-Path $pluginRoot "dsh-antigravity-composer"

$profileDesktopDir = Join-Path $dshHome "profiles\desktop"
$nodeModulesLocal = Join-Path $profileDesktopDir "node_modules\@local\dsh-ui"
$oldNodeModulesLocal = Join-Path $profileDesktopDir "node_modules\@local\dsh-antigravity-composer"

Write-Host "===> Installing @local/dsh-ui into DeepSeek Harness..." -ForegroundColor Cyan

# 0. Clean legacy files
if (Test-Path $oldNodeModulesLocal) {
    cmd /c rmdir "$oldNodeModulesLocal" 2>$null
    if (Test-Path $oldNodeModulesLocal) {
        Remove-Item -Recurse -Force $oldNodeModulesLocal
    }
    Write-Host "[OK] Cleaned legacy junction at $oldNodeModulesLocal" -ForegroundColor Green
}
if (Test-Path $oldUserPluginDir) {
    Remove-Item -Recurse -Force $oldUserPluginDir
    Write-Host "[OK] Cleaned legacy plugin directory at $oldUserPluginDir" -ForegroundColor Green
}

# 1. Ensure target plugin directory
if (-not (Test-Path $pluginRoot)) {
    New-Item -ItemType Directory -Force -Path $pluginRoot | Out-Null
}

# 2. Copy/Link files to ~/.dsh/plugin/dsh-ui
if (Test-Path $userDshPluginDir) {
    Remove-Item -Recurse -Force $userDshPluginDir
}
Copy-Item -Recurse -Force -Path $workspaceDir -Destination $userDshPluginDir
Write-Host "[OK] Synced plugin package to $userDshPluginDir" -ForegroundColor Green

# 3. Create junction in node_modules/@local
$localDir = Join-Path $profileDesktopDir "node_modules\@local"
if (-not (Test-Path $localDir)) {
    New-Item -ItemType Directory -Force -Path $localDir | Out-Null
}
if (Test-Path $nodeModulesLocal) {
    cmd /c rmdir "$nodeModulesLocal" 2>$null
    if (Test-Path $nodeModulesLocal) {
        Remove-Item -Recurse -Force $nodeModulesLocal
    }
}
cmd /c mklink /J "$nodeModulesLocal" "$userDshPluginDir" | Out-Null
Write-Host "[OK] Created junction at $nodeModulesLocal" -ForegroundColor Green

# 4. Update profile package.json
$pkgPath = Join-Path $profileDesktopDir "package.json"
if (Test-Path $pkgPath) {
    $content = Get-Content -Path $pkgPath -Raw -Encoding UTF8
    $json = ConvertFrom-Json $content

    # Clean old bundle & add new bundle
    $bundles = @($json.dsh.profile.bundles | Where-Object { $_ -ne "@local/dsh-antigravity-composer" })
    if ($bundles -notcontains "@local/dsh-ui") {
        $bundles += "@local/dsh-ui"
    }
    $json.dsh.profile.bundles = $bundles

    # Remove old dependency if present
    if ($json.dependencies."@local/dsh-antigravity-composer") {
        $json.dependencies.PSObject.Properties.Remove("@local/dsh-antigravity-composer")
    }

    # Add new dependency
    if (-not $json.dependencies."@local/dsh-ui") {
        $json.dependencies | Add-Member -NotePropertyName "@local/dsh-ui" -NotePropertyValue ("link:" + ($userDshPluginDir -replace '\\', '/')) -Force
    }

    $newJson = $json | ConvertTo-Json -Depth 10
    Set-Content -Path $pkgPath -Value $newJson -Encoding UTF8
    Write-Host "[OK] Registered bundle @local/dsh-ui in $pkgPath" -ForegroundColor Green
}

# 5. Update cordis.patch.yml
$patchPath = Join-Path $profileDesktopDir "cordis.patch.yml"
if (Test-Path $patchPath) {
    $patchContent = Get-Content -Path $patchPath -Raw -Encoding UTF8
    if ($patchContent -match "dsh-antigravity-composer") {
        $patchContent = $patchContent -replace "id: dsh-antigravity-composer", "id: dsh-ui"
        Set-Content -Path $patchPath -Value $patchContent -Encoding UTF8
        Write-Host "[OK] Migrated dsh-antigravity-composer -> dsh-ui in $patchPath" -ForegroundColor Green
    } elseif ($patchContent -notmatch "dsh-ui") {
        $entry = @"

- id: dsh-ui
  disabled: false
  config: {}
"@
        Add-Content -Path $patchPath -Value $entry -Encoding UTF8
        Write-Host "[OK] Enabled plugin patch dsh-ui in $patchPath" -ForegroundColor Green
    } else {
        Write-Host "[OK] Plugin patch dsh-ui already present in $patchPath" -ForegroundColor Green
    }
}

Write-Host "===> DeepSeek Harness Plugin @local/dsh-ui Installed Successfully!" -ForegroundColor Cyan
