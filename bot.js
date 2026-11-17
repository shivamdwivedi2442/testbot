// © Shivam Coder
import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";

const TOKEN = process.env.BOT_TOKEN;
const SHAYARI_API = process.env.SHAYARI_API_URL;

if (!TOKEN) {
  console.error("BOT_TOKEN env me nahi mila.");
  process.exit(1);
}
if (!SHAYARI_API) {
  console.error("SHAYARI_API_URL env me nahi mila.");
  process.exit(1);
}

const INTERVAL_MS = 10_000;

// Message box ke neeche wale buttons
const START_BTN = "▶️ Start";
const STOP_BTN = "⏹ Stop";
const KEYBOARD = {
  reply_markup: {
    keyboard: [[{ text: START_BTN }, { text: STOP_BTN }]],
    resize_keyboard: true,
    is_persistent: true,
  },
};

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
    // PoetryDB: { title, author, lines: [...] } -> poem me se 2-4 lines uthao
    if (Array.isArray(data.lines)) {
      const lines = data.lines.map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return null;
      const n = Math.min(lines.length, 2 + Math.floor(Math.random() * 3)); // 2 se 4 lines
      const start = Math.floor(Math.random() * (lines.length - n + 1));
      return { text: lines.slice(start, start + n).join("\n"), author: data.author || null };
    }

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
    await bot.sendMessage(chatId, s.author ? `${s.text}\n\n— ${s.author}` : s.text, KEYBOARD);
  } catch (err) {
    if (err?.response?.statusCode === 403 || err?.response?.statusCode === 400) {
      stopChat(chatId); // user ne bot block kiya
      return;
    }
    console.error("sendShayari error:", err.message);
  }
}

async function handleStart(chatId) {
  if (running.has(chatId)) {
    await bot.sendMessage(chatId, "Already chal raha hoon ❤️ Rokne ke liye ⏹ Stop dabao.", KEYBOARD);
    return;
  }

  // Interval pehle register karo taaki double click se do loop na bane
  running.set(chatId, setInterval(() => sendShayari(chatId), INTERVAL_MS));

  await bot.sendMessage(chatId, "I love you ❤️", KEYBOARD);
  await sendShayari(chatId); // pehli shayari turant
}

async function handleStop(chatId) {
  const wasRunning = stopChat(chatId);
  await bot.sendMessage(
    chatId,
    wasRunning ? "Band kar diya. Phir se shuru karne ke liye ▶️ Start dabao." : "Abhi kuch chal nahi raha. ▶️ Start dabao.",
    KEYBOARD
  );
}

// /start -> sirf buttons wala menu dikhao
bot.onText(/^\/start(?:@\w+)?$/, (msg) => {
  bot.sendMessage(msg.chat.id, "Shayari shuru karne ke liye neeche ▶️ Start dabao 👇", KEYBOARD);
});

// /stop command bhi kaam karega
bot.onText(/^\/stop(?:@\w+)?$/, (msg) => handleStop(msg.chat.id));

// Buttons dabane par Telegram wahi text message bhejta hai
bot.on("message", (msg) => {
  if (msg.text === START_BTN) handleStart(msg.chat.id);
  else if (msg.text === STOP_BTN) handleStop(msg.chat.id);
});

bot.on("polling_error", (err) => console.error("polling_error:", err.message));

console.log("Shayari Telegram bot chal raha hai...");
