#!/usr/bin/env bash
# TC-BOT-CLIENT-03 (FR-05): customerTgId без подписи initData не принимается.
# Иначе из обычного браузера можно назваться любым Telegram-пользователем.
# Ожидаем 401 и текст "customerTgId provided without valid initData HMAC".
source "$(dirname "$0")/_lib.sh"

SERVICE_60="$(need_state service_60_id)"
DAY="$(next_workday 7)"

RESP="$(api POST /api/booking/lock "$(cat <<JSON
{
  "itemIds": ["$SERVICE_60"],
  "startTime": "${DAY}T15:00:00.000Z",
  "customerTgId": "555111"
}
JSON
)")"
expect_status 401 "$(printf '%s' "$RESP" | http_status)" "customerTgId без initData"
printf '%s' "$RESP" | grep -q "without valid initData HMAC" \
  && echo "  [OK]   причина отказа — отсутствие HMAC" \
  || { echo "  [FAIL] текст отказа не тот" >&2; exit 1; }
