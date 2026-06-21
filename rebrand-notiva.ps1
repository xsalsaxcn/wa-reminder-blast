$ErrorActionPreference = "Stop"

Write-Host "Rebranding app text to Notiva..." -ForegroundColor Cyan

$replacements = @(
  @{
    From = "Notiva"
    To = "Notiva"
  },
  @{
    From = "WhatsApp Blast & Reminder"
    To = "WhatsApp Blast & Reminder"
  },
  @{
    From = "WhatsApp Blast & Reminder - Fixed Professional UI"
    To = "Notiva - WhatsApp Blast & Reminder"
  },
  @{
    From = "Halo, ini test pesan dari sistem WhatsApp Blast & Reminder."
    To = "Halo, ini test pesan dari sistem Notiva."
  }
)

$excludeDirs = @(
  ".git",
  ".next",
  "node_modules",
  "dist",
  "build"
)

$extensions = @(
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".json",
  ".md",
  ".ps1",
  ".html",
  ".css"
)

$files = Get-ChildItem -Path . -Recurse -File | Where-Object {
  $file = $_
  $isExcluded = $false

  foreach ($dir in $excludeDirs) {
    if ($file.FullName -like "\$dir\") {
      $isExcluded = $true
    }
  }

  if ($isExcluded) {
    return $false
  }

  return $extensions -contains $file.Extension.ToLower()
}

$totalChanged = 0

foreach ($file in $files) {
  $path = $file.FullName
  $content = Get-Content -Path $path -Raw
  $newContent = $content

  foreach ($item in $replacements) {
    $newContent = $newContent.Replace($item.From, $item.To)
  }

  if ($newContent -ne $content) {
    Set-Content -Path $path -Value $newContent -Encoding UTF8
    $relative = Resolve-Path -Path $path -Relative
    Write-Host "Updated: $relative" -ForegroundColor Green
    $totalChanged++
  }
}

Write-Host ""
Write-Host "Done. Files changed: $totalChanged" -ForegroundColor Cyan
