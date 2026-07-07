# F19 — Notifications v2 (multi-channel)

**Epic**: [E04 — Observability](../epics/E04-observability.md)
**Prioridade**: Media
**Esforco**: Medium

## Problema

Notifications so funcionam com Telegram. Muitos usuarios preferem Slack, Discord, ou webhooks genericos.

## Solucao

### Abstraction layer

```typescript
interface NotificationChannel {
  name: string;
  send(message: string, metadata?: Record<string, unknown>): Promise<void>;
}
```

### Canais suportados

1. **Telegram** (existente, refatorar)
2. **Slack** (webhook URL)
3. **Discord** (webhook URL)
4. **Generic webhook** (POST para URL customizada)
5. **Desktop notification** (node-notifier)

### Config

```json
{
  "notifications": {
    "channels": [
      { "type": "telegram", "chatId": "..." },
      { "type": "slack", "webhookUrl": "..." }
    ],
    "events": ["gate:created", "run:failed", "budget:alert"]
  }
}
```

### Eventos notificaveis

- Gate criado (aguardando decisao)
- Run falhou
- Budget atingiu threshold
- Pipeline completo
- Feature concluida

## Criterios de aceite

- [ ] Interface NotificationChannel implementada
- [ ] Pelo menos 3 canais (telegram, slack/discord, webhook)
- [ ] Configuracao de quais eventos notificar
- [ ] Desktop notification como fallback
