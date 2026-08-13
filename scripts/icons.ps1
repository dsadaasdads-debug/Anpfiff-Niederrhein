# Erzeugt die App-Symbole. Aufruf:  powershell -File scripts\icons.ps1
# Motiv: Trillerpfeife – grüne Scheibe mit Loch und angesetztem Mundstück,
# passend zum Markenzeichen in app.css.

Add-Type -AssemblyName System.Drawing

$dir = Join-Path $PSScriptRoot "..\icons"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$navy  = [System.Drawing.ColorTranslator]::FromHtml("#0A1120")
$gruen = [System.Drawing.ColorTranslator]::FromHtml("#27DE72")

function New-Icon {
  param([int]$Size, [string]$Pfad, [double]$Inhalt, [bool]$Abgerundet)

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $bg = New-Object System.Drawing.SolidBrush($navy)
  if ($Abgerundet) {
    $r = [int]($Size * 0.22)
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddArc(0, 0, $r*2, $r*2, 180, 90)
    $p.AddArc($Size-$r*2, 0, $r*2, $r*2, 270, 90)
    $p.AddArc($Size-$r*2, $Size-$r*2, $r*2, $r*2, 0, 90)
    $p.AddArc(0, $Size-$r*2, $r*2, $r*2, 90, 90)
    $p.CloseFigure()
    $g.FillPath($bg, $p)
    $p.Dispose()
  } else {
    $g.FillRectangle($bg, 0, 0, $Size, $Size)
  }

  # $Inhalt begrenzt die bemalte Fläche. Maskable-Symbole brauchen mehr Rand,
  # weil Android sie beschneidet.
  $feld = $Size * $Inhalt
  $rand = ($Size - $feld) / 2

  $fg = New-Object System.Drawing.SolidBrush($gruen)

  $d  = $feld * 0.64          # Durchmesser der Pfeifenscheibe
  $cx = $rand + $feld * 0.01
  $cy = $rand + ($feld - $d) / 2

  # Mundstück: Balken mit runder Kuppe, zuerst gezeichnet
  $mh = $d * 0.34
  $mw = $feld * 0.44
  $mx = $cx + $d * 0.72
  $my = $cy + $d * 0.16
  $g.FillRectangle($fg, $mx, $my, $mw, $mh)
  $g.FillEllipse($fg, ($mx + $mw - $mh/2), $my, $mh, $mh)

  # Scheibe darüber, dann das Loch in Hintergrundfarbe
  $g.FillEllipse($fg, $cx, $cy, $d, $d)
  $lochD = $d * 0.24
  $g.FillEllipse($bg, ($cx + $d*0.50), ($cy + $d*0.20), $lochD, $lochD)

  $bmp.Save($Pfad, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $bg.Dispose(); $fg.Dispose()
  "  {0,-24} {1}x{1}" -f (Split-Path $Pfad -Leaf), $Size
}

New-Icon -Size 192 -Pfad (Join-Path $dir "icon-192.png")           -Inhalt 0.76 -Abgerundet $true
New-Icon -Size 512 -Pfad (Join-Path $dir "icon-512.png")           -Inhalt 0.76 -Abgerundet $true
New-Icon -Size 512 -Pfad (Join-Path $dir "icon-maskable-512.png")  -Inhalt 0.56 -Abgerundet $false
New-Icon -Size 180 -Pfad (Join-Path $dir "apple-touch-icon.png")   -Inhalt 0.78 -Abgerundet $false
