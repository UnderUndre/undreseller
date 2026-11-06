// Any setup scripts you might need go here

// Load .env first, then test.env (spec 001-reinit FR-108, research D4):
// DATABASE_URL is forced to the isolated `undreseller_test` database so
// integration tests never touch the dev database configured in `.env`.
// NOTE: this repo ships dotenv@^8, which has NO `override` option (added in
// v16) — the second config() call silently keeps existing keys. Delete the
// keys first, then load test.env so it actually wins.
// @ts-expect-error dotenv@8 ships types that cannot resolve via its exports map
import dotenv from 'dotenv'

dotenv.config()
delete process.env.DATABASE_URL
dotenv.config({ path: 'test.env' })
