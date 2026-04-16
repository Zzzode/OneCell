import { ASSISTANT_NAME } from '../config/config.js';
import { storeMessageDirect } from '../db.js';

export function recordBotMessage(chatJid: string, text: string): void {
  const normalized = text.trim();
  if (!normalized) return;
  const timestamp = new Date().toISOString();
  storeMessageDirect({
    id: `bot:${chatJid}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    chat_jid: chatJid,
    sender: ASSISTANT_NAME,
    sender_name: ASSISTANT_NAME,
    content: normalized,
    timestamp,
    is_from_me: true,
    is_bot_message: true,
  });
}
