const http = require('http');

const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET || 'test_telegram_secret';
const timestamp = Date.now();
const updateId = timestamp;

const payload = {
  update_id: updateId,
  message: {
    message_id: 123,
    date: Math.floor(timestamp / 1000),
    chat: {
      id: 9876543210,
      first_name: 'Test',
      username: 'testuser',
      type: 'private',
    },
    from: {
      id: 9876543210,
      is_bot: false,
      first_name: 'Test',
      username: 'testuser',
    },
    text: '/start',
    entities: [
      {
        offset: 0,
        length: 6,
        type: 'bot_command',
      },
    ],
  },
};

const body = JSON.stringify(payload);

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/bot/telegram/webhook',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'x-telegram-bot-api-secret-token': secretToken,
  },
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
    console.log('\n[INFO] Update ID:', updateId);
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.write(body);
req.end();
