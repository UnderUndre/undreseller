#!/usr/bin/env bash
# TC-WEB-02 (FR-003, FR-004): сетка слотов с шагом 30 минут и отсечение окон,
# которые залезают на обед (13:00–14:00) или за конец смены (18:00).
#
# Корзина на 90 минут. Время в ответе — UTC, а часы магазина заданы «стеночными»
# минутами, которые windows.ts тоже считает от полуночи UTC, так что сравниваем
# часы как есть: 11:30 + 90 мин = 13:00 (ровно до обеда) — доступен,
# 12:00 и 12:30 залезают на обед — скрыты, последний слот дня — 16:30.
source "$(dirname "$0")/_lib.sh"

SERVICE_60="$(need_state service_60_id)"
SERVICE_30="$(need_state service_30_id)"
DAY="$(next_workday 3)"

echo "== Слоты на $DAY для корзины 90 мин =="
RESP="$(api GET "/api/booking/slots?itemIds=$SERVICE_60,$SERVICE_30&date=$DAY")"
expect_status 200 "$(printf '%s' "$RESP" | http_status)" "GET /api/booking/slots"

printf '%s' "$RESP" | sed '/__HTTP_STATUS__/d' | node -e '
  let raw = ""; process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    const hours = (JSON.parse(raw).slots || []).map((s) => s.startTime.slice(11, 16));
    console.log("  старт слотов:", hours.join(", ") || "<пусто>");

    const step = hours.every((h, i) => i === 0 || (toMin(h) - toMin(hours[i - 1])) % 30 === 0);
    check(step, "шаг сетки кратен 30 минутам");
    check(hours.includes("11:30"), "11:30 доступен (11:30 + 90 мин = 13:00, ровно до обеда)");
    check(!hours.includes("12:00"), "12:00 скрыт (залезает на обед 13:00–14:00)");
    check(!hours.includes("12:30"), "12:30 скрыт (залезает на обед)");
    check(hours.includes("14:00"), "14:00 доступен (сразу после обеда)");
    check(hours.includes("16:30"), "16:30 доступен (16:30–18:00, конец смены)");
    check(!hours.includes("17:00"), "17:00 скрыт (не влезает до 18:00)");
    check(!hours.includes("17:30"), "17:30 скрыт (не влезает до 18:00)");
  });
  function toMin(h) { const [hh, mm] = h.split(":").map(Number); return hh * 60 + mm; }
  function check(ok, label) {
    if (ok) console.log("  [OK]  ", label);
    else { console.error("  [FAIL]", label); process.exitCode = 1; }
  }
'
