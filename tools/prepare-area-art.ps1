param([string]$SourceDirectory = 'C:\Users\srime\Desktop')
# Asset preparation only: crop the supplied floor artwork into the renderer's
# tiles (then run tools/even-area-floors.py once). The areas' walls are pixel
# art drawn in code (src/defend/area-wall-art.ts).
Add-Type -AssemblyName System.Drawing
$areaSources = @(
  @('astral','exec-e3ce26d6-de23-4995-8b9a-e084d6f5b2bb',28,30,309,30,585,30,864,30,230),
  @('obsidian','exec-f008d292-1c9d-404e-a00e-5cb988bdd5f8',36,30,313,30,591,30,867,30,226),
  @('frozen','exec-f317daef-b673-42c1-a516-8dc541cbba65',40,40,315,40,590,40,864,40,226),
  @('drowned','exec-71f7d195-6910-45e7-bbc4-fdf41a58ac15',56,40,329,40,598,40,866,40,208),
  @('crystal','exec-130e6969-b3c0-4d52-916b-5e69122e864e',57,42,325,42,595,42,864,42,214),
  @('ember','exec-b03f4143-b9c2-4105-813f-a958b5814196',47,42,316,42,591,42,863,42,214),
  @('fungal','exec-b6fece0e-b669-4a28-af59-3a52d2ccd948',36,35,313,35,591,35,864,35,230),
  @('desert','exec-c5274d6b-0e2a-40fb-bd33-30629acc7c44',54,50,325,50,596,50,864,50,212)
)
function Save-Texture($source, $rect, $width, $height, $path) {
  $out = [System.Drawing.Bitmap]::new($width,$height)
  $graphics = [System.Drawing.Graphics]::FromImage($out)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $graphics.DrawImage($source,[System.Drawing.Rectangle]::new(0,0,$width,$height),$rect,[System.Drawing.GraphicsUnit]::Pixel)
  $out.Save($path,[System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose(); $out.Dispose()
}
$assetRoot = Join-Path $PSScriptRoot '../public/assets/defend/areas'
foreach ($row in $areaSources) {
  $destination = Join-Path $assetRoot $row[0]
  New-Item -ItemType Directory -Force $destination | Out-Null
  $source = [System.Drawing.Bitmap]::new((Join-Path $SourceDirectory ($row[1]+'.png')))
  for ($i=0; $i -lt 4; $i++) {
    $rect = [System.Drawing.Rectangle]::new($row[2+$i*2],$row[3+$i*2],$row[10],$row[10])
    Save-Texture $source $rect 80 80 (Join-Path $destination ('floor-'+($i+1)+'.png'))
  }
  $source.Dispose()
}
