# Fetch S&P500, CBOE SKEW (Yahoo Finance) and Fear & Greed (CNN), write data.js
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function Get-Yahoo($sym) {
  $u = "https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=2y&interval=1d"
  $r = (Invoke-RestMethod -Uri $u -Headers @{ 'User-Agent' = $ua } -TimeoutSec 30).chart.result[0]
  $ts = $r.timestamp
  $c = $r.indicators.quote[0].close
  $out = New-Object System.Collections.ArrayList
  for ($i = 0; $i -lt $ts.Count; $i++) {
    if ($c[$i] -ne $null) {
      $d = [DateTimeOffset]::FromUnixTimeSeconds([int64]$ts[$i]).UtcDateTime.ToString('yyyy-MM-dd')
      [void]$out.Add(@($d, [math]::Round([double]$c[$i], 2)))
    }
  }
  return ,$out
}

function Get-FearGreed {
  $h = @{ 'User-Agent' = $ua; 'Accept' = 'application/json, text/plain, */*'; 'Origin' = 'https://edition.cnn.com'; 'Referer' = 'https://edition.cnn.com/markets/fear-and-greed' }
  $from = (Get-Date).AddDays(-420).ToString('yyyy-MM-dd')
  try {
    $fg = Invoke-RestMethod -Uri "https://production.dataviz.cnn.io/index/fearandgreed/graphdata/$from" -Headers $h -TimeoutSec 30
  } catch {
    $fg = Invoke-RestMethod -Uri 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata' -Headers $h -TimeoutSec 30
  }
  $hist = New-Object System.Collections.ArrayList
  foreach ($p in $fg.fear_and_greed_historical.data) {
    $d = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$p.x).UtcDateTime.ToString('yyyy-MM-dd')
    [void]$hist.Add(@($d, [math]::Round([double]$p.y, 1)))
  }
  $cur = $fg.fear_and_greed
  $curDate = ([DateTime]$cur.timestamp).ToUniversalTime().ToString('yyyy-MM-dd')
  return @{ history = $hist; current = @{ date = $curDate; score = [math]::Round([double]$cur.score, 1) } }
}

try {
  Write-Host 'S&P500 ...'
  $gspc = Get-Yahoo '%5EGSPC'
  Write-Host "  $($gspc.Count) days"
  Write-Host 'SKEW ...'
  $skew = Get-Yahoo '%5ESKEW'
  Write-Host "  $($skew.Count) days"
} catch {
  Write-Host "ERROR: Yahoo Finance fetch failed: $($_.Exception.Message)"
  exit 1
}

$fgData = $null
$fgError = $null
try {
  Write-Host 'Fear & Greed ...'
  $fgData = Get-FearGreed
  Write-Host "  $($fgData.history.Count) days, current=$($fgData.current.score)"
} catch {
  $fgError = $_.Exception.Message
  Write-Host "WARNING: Fear & Greed fetch failed: $fgError"
  # keep the previous F&G data if available
  $prevPath = Join-Path $dir 'data.js'
  if (Test-Path $prevPath) {
    try {
      $prevTxt = [IO.File]::ReadAllText($prevPath).Trim()
      $prevJson = $prevTxt.Substring($prevTxt.IndexOf('{')).TrimEnd(';')
      $prev = $prevJson | ConvertFrom-Json
      if ($prev.fg) { $fgData = $prev.fg; Write-Host '  using previous F&G data' }
    } catch { Write-Host '  previous data.js could not be read' }
  }
}

$obj = @{
  fetchedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm')
  gspc = $gspc
  skew = $skew
  fg = $fgData
  fgError = $fgError
}
$json = $obj | ConvertTo-Json -Depth 6 -Compress
$txt = "window.MARKET_DATA = $json;"
[IO.File]::WriteAllText((Join-Path $dir 'data.js'), $txt, (New-Object Text.UTF8Encoding $false))
Write-Host 'Saved data.js'
exit 0
