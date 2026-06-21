$ErrorActionPreference = "Stop"

Write-Host "Fix remaining Notiva branding..." -ForegroundColor Cyan

$targets = @(
  @{
    Path = "pages/login.js"
    From = "Harmony Health"
    To = "Notiva"
  },
  @{
    Path = "pages/admin/meta-test.js"
    From = "Halo, ini test pesan dari sistem WA Reminder & Blast."
    To = "Halo, ini test pesan dari sistem Notiva."
  },
  @{
    Path = "pages/index.js"
    From = "WA Reminder & Blast"
    To = "Notiva"
  },
  @{
    Path = "pages/setup-master.js"
    From = "WA Reminder & Blast"
    To = "Notiva"
  }
)

foreach ($item in $targets) {
  if (Test-Path $item.Path) {
    $content = Get-Content -Path $item.Path -Raw
    $newContent = $content.Replace($item.From, $item.To)

    if ($newContent -ne $content) {
      Set-Content -Path $item.Path -Value $newContent -Encoding UTF8
      Write-Host "Updated: $($item.Path)" -ForegroundColor Green
    } else {
      Write-Host "No change needed: $($item.Path)" -ForegroundColor Yellow
    }
  } else {
    Write-Host "File not found: $($item.Path)" -ForegroundColor Red
  }
}

Write-Host "Done." -ForegroundColor Cyan