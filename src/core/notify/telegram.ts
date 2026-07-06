import { getSecret } from '../../security/secrets.js';
import { loadConfig } from '../../config/index.js';

/** Notifica o usuario quando um gate precisa de decisao humana. */
export async function notify(message: string): Promise<void> {
  const token = await getSecret('telegram-bot-token');
  const chatId = loadConfig().telegramChatId;
  if (!token || !chatId) return; // notificacao desabilitada

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });
}
