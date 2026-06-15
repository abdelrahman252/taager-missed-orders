param(
  [string]$InputPng = "assets\icon.png"
)

Add-Type -AssemblyName System.Drawing

function Clamp-Byte([double]$value) {
  if ($value -lt 0) { return 0 }
  if ($value -gt 255) { return 255 }
  return [int][Math]::Round($value)
}

function Save-PngBytes([System.Drawing.Bitmap]$bitmap) {
  $stream = New-Object System.IO.MemoryStream
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $stream.ToArray()
  $stream.Dispose()
  return $bytes
}

function Resize-Bitmap([System.Drawing.Bitmap]$source, [int]$size) {
  $dest = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($dest)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.DrawImage($source, 0, 0, $size, $size)
  $graphics.Dispose()
  return $dest
}

function Write-UInt16LE([System.IO.BinaryWriter]$writer, [int]$value) {
  $writer.Write([uint16]$value)
}

function Write-UInt32LE([System.IO.BinaryWriter]$writer, [int64]$value) {
  $writer.Write([uint32]$value)
}

function Write-UInt32BE([System.IO.BinaryWriter]$writer, [int64]$value) {
  $writer.Write([byte](($value -shr 24) -band 255))
  $writer.Write([byte](($value -shr 16) -band 255))
  $writer.Write([byte](($value -shr 8) -band 255))
  $writer.Write([byte]($value -band 255))
}

function Write-Ascii([System.IO.BinaryWriter]$writer, [string]$value) {
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes($value))
}

function Write-Ico([string]$path, [System.Drawing.Bitmap]$source) {
  $sizes = @(256, 128, 64, 48, 32, 16)
  $images = @()
  foreach ($size in $sizes) {
    $resized = Resize-Bitmap $source $size
    $images += [pscustomobject]@{ Size = $size; Bytes = (Save-PngBytes $resized) }
    $resized.Dispose()
  }

  $stream = New-Object System.IO.MemoryStream
  $writer = New-Object System.IO.BinaryWriter $stream
  Write-UInt16LE $writer 0
  Write-UInt16LE $writer 1
  Write-UInt16LE $writer $images.Count

  $offset = 6 + (16 * $images.Count)
  foreach ($image in $images) {
    $size = [int]$image.Size
    $bytes = [byte[]]$image.Bytes
    $directorySize = $size
    if ($directorySize -eq 256) { $directorySize = 0 }
    $writer.Write([byte]$directorySize)
    $writer.Write([byte]$directorySize)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    Write-UInt16LE $writer 1
    Write-UInt16LE $writer 32
    Write-UInt32LE $writer $bytes.Length
    Write-UInt32LE $writer $offset
    $offset += $bytes.Length
  }

  foreach ($image in $images) {
    $writer.Write([byte[]]$image.Bytes)
  }

  [System.IO.File]::WriteAllBytes($path, $stream.ToArray())
  $writer.Dispose()
  $stream.Dispose()
}

function Write-Icns([string]$path, [System.Drawing.Bitmap]$source) {
  $entries = @(
    @{ Type = "ic10"; Size = 1024 },
    @{ Type = "ic09"; Size = 512 },
    @{ Type = "ic08"; Size = 256 },
    @{ Type = "ic07"; Size = 128 },
    @{ Type = "icp6"; Size = 64 },
    @{ Type = "icp5"; Size = 32 },
    @{ Type = "icp4"; Size = 16 }
  )

  $chunks = @()
  $totalLength = 8
  foreach ($entry in $entries) {
    $resized = Resize-Bitmap $source $entry.Size
    $bytes = Save-PngBytes $resized
    $resized.Dispose()
    $chunks += [pscustomobject]@{ Type = $entry.Type; Bytes = $bytes }
    $totalLength += 8 + $bytes.Length
  }

  $stream = New-Object System.IO.MemoryStream
  $writer = New-Object System.IO.BinaryWriter $stream
  Write-Ascii $writer "icns"
  Write-UInt32BE $writer $totalLength
  foreach ($chunk in $chunks) {
    $bytes = [byte[]]$chunk.Bytes
    Write-Ascii $writer ([string]$chunk.Type)
    Write-UInt32BE $writer (8 + $bytes.Length)
    $writer.Write($bytes)
  }

  [System.IO.File]::WriteAllBytes($path, $stream.ToArray())
  $writer.Dispose()
  $stream.Dispose()
}

$resolved = Resolve-Path $InputPng
$loaded = [System.Drawing.Bitmap]::FromFile($resolved)
$source = New-Object System.Drawing.Bitmap $loaded
$loaded.Dispose()
$clean = New-Object System.Drawing.Bitmap $source.Width, $source.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

for ($y = 0; $y -lt $source.Height; $y++) {
  for ($x = 0; $x -lt $source.Width; $x++) {
    $c = $source.GetPixel($x, $y)
    $max = [Math]::Max($c.R, [Math]::Max($c.G, $c.B))
    $alpha = $c.A

    if ($max -lt 112) {
      $alpha = 0
    } elseif ($max -lt 160) {
      $alpha = Clamp-Byte (($max - 112) / 48 * $c.A)
    }

    if ($alpha -eq 0) {
      $clean.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
    } else {
      $clean.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $c.R, $c.G, $c.B))
    }
  }
}

$pngBytes = Save-PngBytes $clean
[System.IO.File]::WriteAllBytes("assets\icon.png", $pngBytes)
Write-Ico "assets\icon.ico" $clean
Write-Icns "assets\icon.icns" $clean

$base64 = [Convert]::ToBase64String($pngBytes)
$svg = "<svg xmlns=`"http://www.w3.org/2000/svg`" xmlns:xlink=`"http://www.w3.org/1999/xlink`" width=`"1024`" height=`"1024`" viewBox=`"0 0 1024 1024`">`n  <image width=`"1024`" height=`"1024`" xlink:href=`"data:image/png;base64,$base64`" />`n</svg>`n"
[System.IO.File]::WriteAllText("assets\icon.svg", $svg, [System.Text.Encoding]::UTF8)

$source.Dispose()
$clean.Dispose()
Write-Output "Regenerated transparent app icons."
