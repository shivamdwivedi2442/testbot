const TelegramBot = require('node-telegram-bot-api');
const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });
console.log('Custom GitHub Bot Started Successfully!');
bot.on('message', (msg) => {
  bot.sendMessage(msg.chat.id, `GitHub Repo Bot Reply: ${msg.text}`);
});
