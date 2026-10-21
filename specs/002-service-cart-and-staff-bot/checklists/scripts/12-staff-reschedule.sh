#!/usr/bin/env bash
# TC-BOT-STAFF-04 (FR-011): кнопка [Перенести] выдаёт одноразовую magic-ссылку.
#
# Ответ вебхука содержит magicRescheduleUrl: orderId, version, expiresAt, nonce, sig.
# В базе confirmationStatus становится RESCHEDULE_OFFERED, а rescheduleTokenHash —
# это SHA-256 от nonce. Повторное нажатие выпускает новый nonce и перезаписывает
# хеш, после чего старая ссылка уже не сойдётся с тем, что лежит в базе.
source "$(dirname "$0")/_lib.sh"

ORDER_ID="$(need_state order_id)"

reschedule() {
  webhook_api "$STAFF_WEBHOOK_SECRET" /api/bot/staff/webhook "$(cat <<JSON
{
  "update_id": $((40000 + RANDOM)),
  "callback_query": {
    "id": "cbq_resched_$RANDOM",
    "from": {"id": $AUTHORIZED_STAFF_USER_ID, "first_name": "Master"},
    "message": {"message_id": 51, "chat": {"id": $STAFF_CHAT_ID}},
    "data": "staff:reschedule:$ORDER_ID"
  }
}
JSON
)"
}

echo "== Первое [Перенести] =="
RESP="$(reschedule)"
expect_status 200 "$(printf '%s' "$RESP" | http_status)" "reschedule"
URL1="$(printf '%s' "$RESP" | sed '/__HTTP_STATUS__/d' | json_get magicRescheduleUrl)"
echo "  ссылка: $URL1"

NONCE1="$(node -e 'process.stdout.write(new URL(process.argv[1]).searchParams.get("nonce") || "")' "$URL1")"
HASH1="$(psql_q "SELECT \"rescheduleTokenHash\" FROM \"Order\" WHERE id = '$ORDER_ID';")"
STATUS1="$(psql_q "SELECT \"confirmationStatus\" FROM \"Order\" WHERE id = '$ORDER_ID';")"
[[ "$STATUS1" == "RESCHEDULE_OFFERED" ]] && echo "  [OK]   confirmationStatus=RESCHEDULE_OFFERED" \
  || { echo "  [FAIL] confirmationStatus=$STATUS1" >&2; exit 1; }

EXPECTED_HASH="$(printf '%s' "$NONCE1" | node -e '
  const { createHash } = require("crypto");
  let raw = ""; process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => process.stdout.write(createHash("sha256").update(raw).digest("hex")));
')"
[[ "$HASH1" == "$EXPECTED_HASH" ]] && echo "  [OK]   rescheduleTokenHash = sha256(nonce)" \
  || { echo "  [FAIL] хеш в базе не совпал с sha256 от nonce" >&2; exit 1; }

echo "== Второе [Перенести] — старый nonce должен умереть =="
RESP="$(reschedule)"
URL2="$(printf '%s' "$RESP" | sed '/__HTTP_STATUS__/d' | json_get magicRescheduleUrl)"
NONCE2="$(node -e 'process.stdout.write(new URL(process.argv[1]).searchParams.get("nonce") || "")' "$URL2")"
HASH2="$(psql_q "SELECT \"rescheduleTokenHash\" FROM \"Order\" WHERE id = '$ORDER_ID';")"

[[ "$NONCE2" != "$NONCE1" ]] && echo "  [OK]   выпущен новый nonce" \
  || { echo "  [FAIL] nonce не изменился" >&2; exit 1; }
[[ "$HASH2" != "$HASH1" && -n "$HASH2" ]] && echo "  [OK]   хеш в базе перезаписан, старая ссылка больше не валидна" \
  || { echo "  [FAIL] хеш не перезаписан" >&2; exit 1; }
echo "  новая ссылка: $URL2"
