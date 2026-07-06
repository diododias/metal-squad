export interface NotificationChannel {
  readonly name: string;
  send(message: string, metadata?: Record<string, unknown>): Promise<void>;
}
