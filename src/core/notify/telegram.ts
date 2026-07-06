import { getSecret } from '../../security/secrets.js';
import { loadConfig } from '../../config/index.js';
import { bus } from '../events/bus.js';

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

/**
 * Registra listeners no bus para enviar notificações automáticas.
 * Retorna um cleanup para remover os listeners.
 */
export function subscribeToNotifications(): () => void {
  const onGateCreated = ({ gateId, featureId }: { gateId: number; featureId: string }): void => {
    notify(`metal-squad: gate ${gateId} aguardando decisão — feature ${featureId}`).catch(() => {});
  };

  const onRunFailed = ({ runId, error }: { runId: number; error: string }): void => {
    notify(`metal-squad: run ${runId} falhou — ${error}`).catch(() => {});
  };

  const onBudgetAlert = ({ percent, spent, limit }: { percent: number; spent: number; limit: number }): void => {
    notify(`metal-squad: alerta de budget — ${percent}% usado (${spent}/${limit} tokens)`).catch(() => {});
  };

  bus.on('gate:created', onGateCreated);
  bus.on('run:failed', onRunFailed);
  bus.on('budget:alert', onBudgetAlert);

  return () => {
    bus.off('gate:created', onGateCreated);
    bus.off('run:failed', onRunFailed);
    bus.off('budget:alert', onBudgetAlert);
  };
}
