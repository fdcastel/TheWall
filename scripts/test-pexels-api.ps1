<#
Simple test script to call Pexels /v1/search API from PowerShell.

Usage examples (PowerShell):
  # Use PEXELS_API_KEY environment variable
  pwsh.exe -File .\test-pexels-api.ps1 -Count 1 -Orientation landscape -Query "nature"

  # Or pass key inline
  pwsh.exe -File .\test-pexels-api.ps1 -Count 3 -Orientation portrait -Query "city" -AccessKey YOUR_API_KEY

Notes:
- The script will use $env:PEXELS_API_KEY if you don't pass -AccessKey.
- Query parameter is required for Pexels API.
- Results are printed as formatted JSON. Increase -Depth if needed.
#>
param(
    [int]$Count = 5,
    [string]$Orientation = 'landscape',
    [string]$Query = 'norway',
    [string]$AccessKey = $env:PEXELS_API_KEY
)

if (-not $Query -or $Query.Trim().Length -eq 0) {
    $Query = Read-Host -Prompt 'Enter search query (required for Pexels API)'
}

if (-not $Query -or $Query.Trim().Length -eq 0) {
    Write-Error 'No search query provided. Pexels API requires a query parameter.'
    exit 2
}

if (-not $AccessKey -or $AccessKey -eq '') {
    $AccessKey = Read-Host -Prompt 'Enter Pexels API Key (or set env var PEXELS_API_KEY)'
}

if (-not $AccessKey -or $AccessKey -eq '') {
    Write-Error 'No API key provided. Set the PEXELS_API_KEY environment variable or pass -AccessKey.'
    exit 2
}

# Build request URL
$base = 'https://api.pexels.com/v1/search'
$queryParts = @()
$queryParts += "query=$([System.Uri]::EscapeDataString($Query))"
$queryParts += "per_page=$Count"
if ($Orientation) { $queryParts += "orientation=$([System.Uri]::EscapeDataString($Orientation))" }
$uri = $base + '?' + ($queryParts -join '&')

Write-Host "Requesting: $uri" -ForegroundColor Cyan

$headers = @{ 'Authorization' = $AccessKey }

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