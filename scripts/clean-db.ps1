# Clean database script - resets database to clean state
# Usage: .\scripts\clean-db.ps1

$ErrorActionPreference = "Stop"

Write-Host "🔄 Resetting database..." -ForegroundColor Cyan
Write-Host "   This will delete all data and re-apply migrations" -ForegroundColor DarkYellow
Write-Host ""

# Reset database (deletes all data, re-applies migrations)
pnpm prisma migrate reset --force

Write-Host ""
Write-Host "🌱 Seeding database with demo data..." -ForegroundColor Cyan
pnpm db:seed

Write-Host ""
Write-Host "✅ Database reset and seeded successfully" -ForegroundColor Green
Write-Host ""
Write-Host "Next step:" -ForegroundColor Yellow
Write-Host "  Run: pnpm dev"
