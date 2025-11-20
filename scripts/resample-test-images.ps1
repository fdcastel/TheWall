# Constants
$sourceDir = "./samples-originals"
$targetDir = "./samples"
$quality = 10  # JPEG quality to reduce file size to around 10% of original

# Load System.Drawing assembly
Add-Type -AssemblyName System.Drawing

# Delete all files in the target folder
if (Test-Path $targetDir) {
    Remove-Item $targetDir -Recurse -Force
}
New-Item -ItemType Directory -Path $targetDir -Force | Out-Null

# Get JPEG encoder
$jpegEncoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.FormatDescription -eq "JPEG" }

# Set encoder parameters for quality
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, $quality)

# Process each image file in the source folder
Get-ChildItem $sourceDir -File | Where-Object { $_.Extension -match '\.(jpg|jpeg|png|bmp|tiff)$' } | ForEach-Object {
    $sourcePath = $_.FullName
    $targetPath = Join-Path $targetDir ($_.BaseName + ".jpg")  # Save as .jpg

    try {
        $img = [System.Drawing.Image]::FromFile($sourcePath)
        Write-Host "Processing $($_.Name)..."
        $img.Save($targetPath, $jpegEncoder, $encoderParams)
        $img.Dispose()
    } catch {
        Write-Host "Error processing $($_.Name): $_"
    }
}