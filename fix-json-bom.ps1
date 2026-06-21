$ErrorActionPreference = "Stop"

Write-Host "Cleaning UTF-8 BOM from JSON files..." -ForegroundColor Cyan

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$files = Get-ChildItem -Path . -Recurse -File -Filter *.json | Where-Object {
  $_.FullName -notlike "\node_modules\" -and
  $_.FullName -notlike "\.next\" -and
  $_.FullName -notlike "\.git\"
}

foreach ($file in $files) {
  $path = $file.FullName
  $content = [System.IO.File]::ReadAllText($path)

  $cleanContent = $content.TrimStart([char]0xFEFF)

  [System.IO.File]::WriteAllText($path, $cleanContent, $utf8NoBom)

  Write-Host "Cleaned: $($file.FullName)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done cleaning JSON files." -ForegroundColor Cyan