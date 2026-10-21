import crypto from 'crypto';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read .env
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const webhookSecret = envContent
  .split('\n')
  .find(line => line.startsWith('TELEGRAM_WEBHOOK_SECRET'))
  ?.split('=')[1]
  ?.trim()
  ?.replace(/^"|"$/g, '');

console.log('Webhook Secret:', webhookSecret);

const updateId = Math.floor(Date.now() / 1000);
const payload = {
  update_id: updateId,
  message: {
    message_id: 1,
    date: updateId,
    chat: {
      id: 123456789,
      type: 'private',
    },
    from: {
      id: 123456789,
      is_bot: false,
      first_name: 'Test',
    },
    text: '/start',
  },
};

const payloadJson = JSON.stringify(payload);
console.log('Payload:', payloadJson);

// Send webhook
fetch('http://localhost:3000/api/bot/telegram/webhook', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Telegram-Bot-Api-Secret-Token': webhookSecret,
  },
  body: payloadJson,
})
  .then(res => {
    console.log('Status:', res.status);
    return res.text();
  })
  .then(body => console.log('Response:', body))
  .catch(err => console.error('Error:', err));
