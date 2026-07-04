param(
  [Parameter(Mandatory=$true)][string]$VideoPath,
  [Parameter(Mandatory=$true)][string]$OutputDir,
  [double[]]$Times = @()
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

if (!(Test-Path -LiteralPath $VideoPath)) {
  throw "Video not found: $VideoPath"
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$player = New-Object System.Windows.Media.MediaPlayer
$player.ScrubbingEnabled = $true
$opened = $false
$failed = $null
$player.add_MediaOpened({ $script:opened = $true })
$player.add_MediaFailed({ $script:failed = $_.ErrorException })
$player.Open([Uri]::new((Resolve-Path -LiteralPath $VideoPath).Path))

$deadline = (Get-Date).AddSeconds(20)
while (!$opened -and !$failed -and (Get-Date) -lt $deadline) {
  [System.Windows.Threading.Dispatcher]::CurrentDispatcher.Invoke(
    [Action]{},
    [System.Windows.Threading.DispatcherPriority]::Background
  )
  Start-Sleep -Milliseconds 50
}
if ($failed) { throw $failed }
if (!$opened) { throw "Timed out opening media." }

$duration = if ($player.NaturalDuration.HasTimeSpan) { $player.NaturalDuration.TimeSpan.TotalSeconds } else { 0 }
$width = [int]$player.NaturalVideoWidth
$height = [int]$player.NaturalVideoHeight
if ($width -le 0 -or $height -le 0) {
  $width = 1920
  $height = 1080
}

if (!$Times -or !$Times.Count) {
  $Times = 0..12 | ForEach-Object { [Math]::Min($duration, $_ * [Math]::Max(0.5, $duration / 12.0)) }
}

$encoderType = [System.Windows.Media.Imaging.PngBitmapEncoder]
$pixelFormat = [System.Windows.Media.PixelFormats]::Pbgra32
$results = @()

foreach ($time in $Times) {
  $safeTime = [double][Math]::Max(0.0, [Math]::Min([double]$time, [Math]::Max(0.0, $duration - 0.05)))
  $player.Position = [TimeSpan]::FromSeconds($safeTime)
  $player.Play()
  Start-Sleep -Milliseconds 180
  $player.Pause()
  [System.Windows.Threading.Dispatcher]::CurrentDispatcher.Invoke(
    [Action]{},
    [System.Windows.Threading.DispatcherPriority]::Background
  )

  $visual = New-Object System.Windows.Media.DrawingVisual
  $context = $visual.RenderOpen()
  $rect = New-Object System.Windows.Rect(0, 0, $width, $height)
  $context.DrawVideo($player, $rect)
  $context.Close()

  $bitmap = New-Object System.Windows.Media.Imaging.RenderTargetBitmap($width, $height, 96, 96, $pixelFormat)
  $bitmap.Render($visual)
  $encoder = New-Object $encoderType
  $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
  $fileName = "frame_{0:00000}ms.png" -f [int]([Math]::Round($safeTime * 1000))
  $outPath = Join-Path $OutputDir $fileName
  $stream = [System.IO.File]::Open($outPath, [System.IO.FileMode]::Create)
  try { $encoder.Save($stream) } finally { $stream.Close() }
  $results += [pscustomobject]@{ time = $safeTime; path = $outPath }
}

$player.Close()
[pscustomobject]@{
  duration = $duration
  width = $width
  height = $height
  frames = $results
} | ConvertTo-Json -Depth 4
