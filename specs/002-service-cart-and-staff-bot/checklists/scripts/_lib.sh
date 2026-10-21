#!/usr/bin/env bash
# Общие хелперы для ручного QA-прогона фичи 002.
# Подключается через `source`, сам по себе ничего не делает.
#
# Зависимости: bash, curl, node (встроен в dev-стенд — нужен для разбора JSON,
# потому что jq на машине нет). Docker и PostgreSQL нужны только там, где скрипт
# лезет в базу напрямую (00, 01, 03, 05).

set -euo pipefail

# Корень пакета undreseller — отсюда читается .env и сюда смотрит docker compose.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

# --- Значения по умолчанию (совпадают с .env.example). Переопределяются .env и окружением. ---
: "${BASE_URL:=http://localhost:3000}"
: "${ADMIN_TOKEN:=test_admin_token_secret_1234567890}"
: "${TELEGRAM_BOT_TOKEN:=}"
: "${TELEGRAM_WEBHOOK_SECRET:=test_telegram_secret}"
: "${STAFF_BOT_TOKEN:=}"
: "${STAFF_WEBHOOK_SECRET:=test_staff_webhook_secret}"
: "${STAFF_CHAT_ID:=-1001234567890}"
: "${AUTHORIZED_STAFF_USER_ID:=777000111}"
: "${DATABASE_URL:=postgresql://postgres:postgres@localhost:5432/undreseller?schema=public}"

# .env перекрывает дефолты, но НЕ перекрывает переменные, уже заданные в окружении.
if [[ -f "$REPO_ROOT/.env" ]]; then
  while IFS= read -r line; do
    [[ "$line" =~ ^[A-Z0-9_]+= ]] || continue
    key="${line%%=*}"
    [[ -z "${!key+x}" ]] && export "$line"
  done < "$REPO_ROOT/.env"
fi

# Куда складывать ответы и id, добытые по ходу прогона.
STATE_DIR="${STATE_DIR:-$(dirname "${BASH_SOURCE[0]}")/.state}"
mkdir -p "$STATE_DIR"

# Печатает значение поля верхнего уровня из JSON на stdin.
# Использование: echo "$json" | json_get item.id
json_get() {
  node -e '
    let raw = "";
    process.stdin.on("data", (c) => (raw += c));
    process.stdin.on("end", () => {
      const path = process.argv[1].split(".");
      let v = JSON.parse(raw);
      for (const k of path) v = v == null ? undefined : v[k];
      if (v === undefined || v === null) process.exit(2);
      process.stdout.write(typeof v === "string" ? v : JSON.stringify(v));
    });
  ' "$1"
}

# POST/PUT с JSON-телом. Тело — последний аргумент, можно передать через heredoc:
#   api POST /api/booking/lock "$(cat <<'JSON' ... JSON )"
api() {
  local method="$1" path="$2" body="${3:-}"
  shift $(($# < 3 ? $# : 3))
  local args=(-sS -w $'\n__HTTP_STATUS__:%{http_code}\n' -X "$method" "$BASE_URL$path" "$@")
  if [[ -n "$body" ]]; then
    args+=(-H "Content-Type: application/json" --data "$body")
  fi
  curl "${args[@]}"
}

# Как api, но с админским токеном.
admin_api() {
  local method="$1" path="$2" body="${3:-}"
  api "$method" "$path" "$body" -H "Authorization: Bearer $ADMIN_TOKEN"
}

# Запрос от имени Telegram-вебхука.
webhook_api() {
  local secret="$1" path="$2" body="$3"
  api POST "$path" "$body" -H "X-Telegram-Bot-Api-Secret-Token: $secret"
}

# Достаёт код ответа, который api дописывает последней строкой.
http_status() {
  grep -o '__HTTP_STATUS__:[0-9]*' | tail -1 | cut -d: -f2
}

# Проверка «получили ровно то, что ждали». При провале печатает весь ответ и выходит.
expect_status() {
  local expected="$1" actual="$2" label="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  [OK]   $label -> HTTP $actual"
  else
    echo "  [FAIL] $label: ждали HTTP $expected, получили HTTP ${actual:-<пусто>}" >&2
    return 1
  fi
}

# Читает id, сохранённый предыдущим скриптом (например, order_id из 03).
need_state() {
  local file="$STATE_DIR/$1"
  if [[ ! -s "$file" ]]; then
    echo "  [FAIL] нет файла состояния $file — сначала прогони скрипт, который его создаёт" >&2
    exit 1
  fi
  cat "$file"
}

# Прямой SQL в контейнер postgres. psql на хосте не нужен.
psql_q() {
  docker exec -i undreseller_db \
    psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-undreseller}" \
    -v ON_ERROR_STOP=1 -At -c "$1"
}

# Ближайший рабочий день (Пн–Пт) через N дней, формат YYYY-MM-DD.
next_workday() {
  local offset="${1:-1}"
  node -e '
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + Number(process.argv[1]));
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    process.stdout.write(d.toISOString().slice(0, 10));
  ' "$offset"
}
