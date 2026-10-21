#!/usr/bin/env bash
# Гоняет весь API-прогон по порядку и печатает сводку.
#
# ⚠️  ПЕРЕД ЗАПУСКОМ: зарегистрировать вебхуки ботов на сервер:
#     PUBLIC_URL=https://myserver.com bash _setup-webhooks.sh
#
# Заказ из 03-web-checkout.sh проходит через скрипты конвейером:
#   03 создаёт -> 10 проверяет чужой клик -> 11 принимает -> 12 переносит -> 14 закрывает.
# Поэтому 11, 12 и 14 по отдельности повторно запускать нельзя — заказ уже сменит состояние.
# Скрипт 16 (возврат) идёт последним и этого заказа касается.
#
source "$(dirname "$0")/_lib.sh"

cd "$(dirname "$0")"
PASSED=0
FAILED=0

for script in \
  00-preflight.sh 01-web-cart.sh 02-web-slots.sh 03-web-checkout.sh \
  04-web-conflict.sh 05-web-cart-guard.sh 06-bot-client-secret.sh \
  07-bot-client-inbox.sh 08-bot-client-initdata-guard.sh 09-bot-client-initdata-valid.sh \
  17-bot-client-confirm.sh 10-staff-unauth.sh 11-staff-approve.sh 12-staff-reschedule.sh \
  13-staff-blacklist.sh 14-staff-fulfill.sh 15-staff-card.sh 16-refund.sh
do
  echo
  echo "########## $script ##########"
  if bash "$script"; then
    PASSED=$((PASSED + 1))
  else
    FAILED=$((FAILED + 1))
    echo "########## $script УПАЛ ##########" >&2
  fi
done

echo
echo "=========================================="
echo "  прошло: $PASSED    упало: $FAILED"
echo "=========================================="
[[ "$FAILED" == "0" ]]
