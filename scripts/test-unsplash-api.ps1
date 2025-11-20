<#
Simple test script to call Unsplash /photos/random API from PowerShell.

Usage examples (PowerShell):
  # Use UNSPLASH_ACCESS_KEY environment variable
  pwsh.exe -File .\test-api.ps1 -Count 1 -Orientation landscape

  # Or pass key inline
  pwsh.exe -File .\test-api.ps1 -Count 3 -Orientation portrait -AccessKey YOUR_ACCESS_KEY

Notes:
- The script will use $env:UNSPLASH_ACCESS_KEY if you don't pass -AccessKey.
- Results are printed as formatted JSON. Increase -Depth if needed.
#>
param(
    [int]$Count = 5,
    [string]$Orientation = 'landscape',
    [string]$Query = 'norway',
    [string]$AccessKey = $env:UNSPLASH_ACCESS_KEY
)

if (-not $AccessKey -or $AccessKey -eq '') {
    $AccessKey = Read-Host -Prompt 'Enter Unsplash Access Key (or set env var UNSPLASH_ACCESS_KEY)'
}

if (-not $AccessKey -or $AccessKey -eq '') {
    Write-Error 'No access key provided. Set the UNSPLASH_ACCESS_KEY environment variable or pass -AccessKey.'
    exit 2
}

# Build request URL
$base = 'https://api.unsplash.com/photos/random'
$queryParts = @()
$queryParts += "count=$Count"
if ($Orientation) { $queryParts += "orientation=$([System.Uri]::EscapeDataString($Orientation))" }
if ($Query -and $Query.Trim().Length -gt 0) { $queryParts += "query=$([System.Uri]::EscapeDataString($Query))" }
$uri = $base + '?' + ($queryParts -join '&')

Write-Host "Requesting: $uri" -ForegroundColor Cyan

$headers = @{ 'Authorization' = "Client-ID $AccessKey" }

try {
    # Use Invoke-WebRequest to show raw JSON content and status on error if needed
    Invoke-WebRequest -Uri $uri -Headers $headers -Method Get -UseBasicParsing -ErrorAction Stop
} catch {
    Write-Error "Request failed: $($_.Exception.Message)"
    if ($_.Exception.Response -and $_.Exception.Response.Content) {
        Write-Output "Response content:" -ForegroundColor Yellow
        try { $_.Exception.Response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10 | Write-Output } catch { $_.Exception.Response.Content | Write-Output }
    }
    exit 1
}
