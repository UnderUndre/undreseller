#!/usr/bin/env bash
# TC-BOT-CLIENT-03b: контрольный прогон — ПРАВИЛЬНО подписанный initData проходит.
#
# Подпись считается так же, как в lib/security/initData.ts:
#   secret_key    = HMAC_SHA256(key="WebAppData", data=TELEGRAM_BOT_TOKEN)
#   data_check    = пары key=value без hash, ключи по алфавиту, через \n
#   hash          = hex(HMAC_SHA256(key=secret_key, data=data_check))
# auth_date обязан быть не старше часа, поэтому берём текущее время.
#
# ВАЖНО: TELEGRAM_BOT_TOKEN должен быть тем же, что видит запущенный `npm run dev`.
# Заглушка из .env.example подойдёт, пока она прописана и в .env, и в окружении сервера.
source "$(dirname "$0")/_lib.sh"

if [[ -z "$TELEGRAM_BOT_TOKEN" ]]; then
  echo "  [SKIP] TELEGRAM_BOT_TOKEN пуст. Впиши токен бота в .env (или экспортируй) и запусти снова." >&2
  echo "         Токен выдаёт @BotFather: /mybots -> бот -> API Token." >&2
  exit 0
fi

SERVICE_60="$(need_state service_60_id)"
DAY="$(next_workday 8)"
TG_USER_ID="${TG_USER_ID:-555111}"

INIT_DATA="$(TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN" TG_USER_ID="$TG_USER_ID" node -e '
  const { createHmac } = require("crypto");
  const user = JSON.stringify({ id: Number(process.env.TG_USER_ID), first_name: "Alex", username: "alex_client" });
  const params = new URLSearchParams();
  params.set("auth_date", String(Math.floor(Date.now() / 1000)));
  params.set("query_id", "AAE_manual_qa");
  params.set("user", user);
  const dataCheck = [...params.keys()].sort().map((k) => k + "=" + params.get(k)).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(process.env.TELEGRAM_BOT_TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(dataCheck).digest("hex"));
  process.stdout.write(params.toString());
')"

RESP="$(api POST /api/booking/lock "$(cat <<JSON
{
  "itemIds": ["$SERVICE_60"],
  "startTime": "${DAY}T09:00:00.000Z",
  "customerTgId": "$TG_USER_ID",
  "initData": "$INIT_DATA"
}
JSON
)")"
expect_status 201 "$(printf '%s' "$RESP" | http_status)" "бронь с валидным initData"

ORDER_ID="$(printf '%s' "$RESP" | sed '/__HTTP_STATUS__/d' | json_get order.id)"
SAVED="$(psql_q "SELECT \"customerTgId\" FROM \"Order\" WHERE id = '$ORDER_ID';")"
[[ "$SAVED" == "$TG_USER_ID" ]] && echo "  [OK]   заказ привязан к telegram id $TG_USER_ID" \
  || { echo "  [FAIL] customerTgId в базе: $SAVED" >&2; exit 1; }
