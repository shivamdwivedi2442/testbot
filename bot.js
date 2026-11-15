// © Shivam Coder
import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error("BOT_TOKEN missing hai.");
  process.exit(1);
}

const SHAYARI_API =
  process.env.SHAYARI_API_URL ||
  "https://farzi-vichar-api.vercel.app/language/hindi/random";
const INTERVAL_MS = 10_000;

const bot = new TelegramBot(TOKEN, { polling: true });
const running = new Map(); // chatId -> interval id

const TEXT_KEYS = ["content", "shayari", "quote", "text", "message", "body"];
const AUTHOR_KEYS = ["author", "writer", "by"];

const pick = (obj, keys) => {
  for (const k of keys) {
    if (typeof obj[k] === "string" && obj[k].trim()) return obj[k].trim();
  }
  return null;
};

function extract(data) {
  if (typeof data === "string") return { text: data.trim(), author: null };
  if (Array.isArray(data)) {
    return data.length ? extract(data[Math.floor(Math.random() * data.length)]) : null;
  }
  if (data && typeof data === "object") {
    const text = pick(data, TEXT_KEYS);
    if (text) return { text, author: pick(data, AUTHOR_KEYS) };
    for (const k of ["data", "result", "results", "quote"]) {
      if (data[k] !== undefined) {
        const inner = extract(data[k]);
        if (inner) return inner;
      }
    }
  }
  return null;
}

async function fetchShayari() {
  const r = await fetch(SHAYARI_API, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`API status ${r.status}`);
  const raw = await r.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }
  const s = extract(data);
  if (!s?.text) throw new Error("Shayari nahi mili");
  return s;
}

function stopChat(chatId) {
  const id = running.get(chatId);
  if (id === undefined) return false;
  clearInterval(id);
  running.delete(chatId);
  return true;
}

async function sendShayari(chatId) {
  try {
    const s = await fetchShayari();
    if (!running.has(chatId)) return; // stop ke baad na bhejo
    await bot.sendMessage(chatId, s.author ? `${s.text}\n\n— ${s.author}` : s.text);
  } catch (err) {
    if (err?.response?.statusCode === 403 || err?.response?.statusCode === 400) {
      stopChat(chatId); // user ne bot block kiya
      return;
    }
    console.error("sendShayari error:", err.message);
  }
}

bot.onText(/^\/start(?:@\w+)?$/, async (msg) => {
  const chatId = msg.chat.id;

  if (running.has(chatId)) {
    await bot.sendMessage(chatId, "Already chal raha hoon ❤️ Rokne ke liye /stop bhejo.");
    return;
  }

  running.set(chatId, setInterval(() => sendShayari(chatId), INTERVAL_MS));

  await bot.sendMessage(chatId, "I love you ❤️");
  await sendShayari(chatId); // pehli shayari turant
});

bot.onText(/^\/stop(?:@\w+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  const wasRunning = stopChat(chatId);
  await bot.sendMessage(
    chatId,
    wasRunning ? "Band kar diya. Phir se shuru karne ke liye /start bhejo." : "Abhi kuch chal nahi raha. /start bhejo."
  );
});

bot.on("polling_error", (err) => console.error("polling_error:", err.message));

console.log("Shayari Telegram bot chal raha hai...");
