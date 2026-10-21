# Load .env
$env_content = Get-Content .env -Raw
$env_content -split "`n" | ForEach-Object {
    if ($_ -match "^([^=]+)=(.*)$") {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim('"')
        Set-Item -Path "env:$key" -Value $value -Force
    }
}

$PUBLIC_URL = $env:PUBLIC_URL.TrimEnd('/')
$TELEGRAM_BOT_TOKEN = $env:TELEGRAM_BOT_TOKEN
$STAFF_BOT_TOKEN = $env:STAFF_BOT_TOKEN
$TELEGRAM_WEBHOOK_SECRET = $env:TELEGRAM_WEBHOOK_SECRET
$STAFF_WEBHOOK_SECRET = $env:STAFF_WEBHOOK_SECRET

Write-Host "=== Re-registering Telegram Webhooks ===" -ForegroundColor Cyan
Write-Host "PUBLIC_URL: $PUBLIC_URL"
Write-Host ""

# Register client bot webhook
Write-Host "Registering Client Bot webhook..." -ForegroundColor Yellow
$webhook_url = "$PUBLIC_URL/api/bot/telegram/webhook"
$response = Invoke-WebRequest -Uri "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" `
    -Method Post `
    -Body @{ url = $webhook_url; secret_token = $TELEGRAM_WEBHOOK_SECRET } `
    -UseBasicParsing
$result = $response.Content | ConvertFrom-Json
if ($result.ok) {
    Write-Host "  ✓ Client Bot webhook registered" -ForegroundColor Green
    Write-Host "  URL: $webhook_url"
} else {
    Write-Host "  ✗ Failed: $($result.description)" -ForegroundColor Red
}

Write-Host ""

# Register staff bot webhook
Write-Host "Registering Staff Bot webhook..." -ForegroundColor Yellow
$webhook_url = "$PUBLIC_URL/api/bot/staff/webhook"
$response = Invoke-WebRequest -Uri "https://api.telegram.org/bot$STAFF_BOT_TOKEN/setWebhook" `
    -Method Post `
    -Body @{ url = $webhook_url; secret_token = $STAFF_WEBHOOK_SECRET } `
    -UseBasicParsing
$result = $response.Content | ConvertFrom-Json
if ($result.ok) {
    Write-Host "  ✓ Staff Bot webhook registered" -ForegroundColor Green
    Write-Host "  URL: $webhook_url"
} else {
    Write-Host "  ✗ Failed: $($result.description)" -ForegroundColor Red
}

Write-Host ""
Write-Host "Verifying webhook status..." -ForegroundColor Cyan
Write-Host ""

# Check client bot
$response = Invoke-WebRequest -Uri "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo" -UseBasicParsing
$webhook_info = $response.Content | ConvertFrom-Json
Write-Host "Client Bot:" -ForegroundColor Yellow
Write-Host "  URL: $($webhook_info.result.url)"
Write-Host "  Pending: $($webhook_info.result.pending_update_count)"
if ($webhook_info.result.last_error_message) {
    Write-Host "  Last error: $($webhook_info.result.last_error_message)" -ForegroundColor Red
}

Write-Host ""

# Check staff bot
$response = Invoke-WebRequest -Uri "https://api.telegram.org/bot$STAFF_BOT_TOKEN/getWebhookInfo" -UseBasicParsing
$webhook_info = $response.Content | ConvertFrom-Json
Write-Host "Staff Bot:" -ForegroundColor Yellow
Write-Host "  URL: $($webhook_info.result.url)"
Write-Host "  Pending: $($webhook_info.result.pending_update_count)"
if ($webhook_info.result.last_error_message) {
    Write-Host "  Last error: $($webhook_info.result.last_error_message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "[OK] Webhook setup complete" -ForegroundColor Green
