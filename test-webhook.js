const updateId = 1283032197;
const body = {
  update_id: updateId,
  message: {
    message_id: 42,
    date: Math.floor(Date.now() / 1000),
    chat: {
      id: 123456789,
      type: "private"
    },
    from: {
      id: 123456789,
      is_bot: false,
      first_name: "TestUser"
    },
    text: "/start"
  }
};

const http = require("http");

const options = {
  hostname: "localhost",
  port: 3000,
  path: "/api/bot/telegram/webhook",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Telegram-Bot-API-Secret-Token": "test_telegram_secret"
  }
};

const req = http.request(options, (res) => {
  let data = "";
  res.on("data", chunk => data += chunk);
  res.on("end", () => {
    console.log("Status:", res.statusCode);
    console.log("Response:", data);
  });
});

req.on("error", (e) => console.error("Error:", e));
req.write(JSON.stringify(body));
req.end();
