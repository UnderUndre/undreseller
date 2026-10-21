# Load .env
$env_content = Get-Content .env -Raw
$env_content -split "`n" | ForEach-Object {
    if ($_ -match "^([^=]+)=(.*)$") {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim('"')
        Set-Item -Path "env:$key" -Value $value -Force
    }
}

$PUBLIC_URL = $env:PUBLIC_URL
$TELEGRAM_BOT_TOKEN = $env:TELEGRAM_BOT_TOKEN
$STAFF_BOT_TOKEN = $env:STAFF_BOT_TOKEN
$TELEGRAM_WEBHOOK_SECRET = $env:TELEGRAM_WEBHOOK_SECRET
$STAFF_WEBHOOK_SECRET = $env:STAFF_WEBHOOK_SECRET

Write-Host "=== Telegram Webhook Status ===" -ForegroundColor Cyan
Write-Host "PUBLIC_URL: $PUBLIC_URL"
Write-Host ""

# Check client bot
Write-Host "Client Bot ($($TELEGRAM_BOT_TOKEN.Substring(0, 10))...):" -ForegroundColor Yellow
$response = Invoke-WebRequest -Uri "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo" -UseBasicParsing
$webhook_info = $response.Content | ConvertFrom-Json
if ($webhook_info.ok) {
    Write-Host "  Status: OK" -ForegroundColor Green
    Write-Host "  URL: $($webhook_info.result.url)"
    Write-Host "  Pending updates: $($webhook_info.result.pending_update_count)"
    if ($webhook_info.result.last_error_message) {
        Write-Host "  Last error: $($webhook_info.result.last_error_message)" -ForegroundColor Red
    }
} else {
    Write-Host "  Status: FAIL" -ForegroundColor Red
    Write-Host "  Error: $($webhook_info.description)"
}

Write-Host ""

# Check staff bot
Write-Host "Staff Bot ($($STAFF_BOT_TOKEN.Substring(0, 10))...):" -ForegroundColor Yellow
$response = Invoke-WebRequest -Uri "https://api.telegram.org/bot$STAFF_BOT_TOKEN/getWebhookInfo" -UseBasicParsing
$webhook_info = $response.Content | ConvertFrom-Json
if ($webhook_info.ok) {
    Write-Host "  Status: OK" -ForegroundColor Green
    Write-Host "  URL: $($webhook_info.result.url)"
    Write-Host "  Pending updates: $($webhook_info.result.pending_update_count)"
    if ($webhook_info.result.last_error_message) {
        Write-Host "  Last error: $($webhook_info.result.last_error_message)" -ForegroundColor Red
    }
} else {
    Write-Host "  Status: FAIL" -ForegroundColor Red
    Write-Host "  Error: $($webhook_info.description)"
}
