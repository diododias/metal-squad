export interface NotificationMetadata extends Record<string, unknown> {
  featureId?: string;
  featureName?: string;
  requestId?: number;
  gateId?: number;
  stage?: string;
  reply_markup?: Record<string, unknown>;
}

export interface NotificationChannel {
  readonly name: string;
  send(message: string, metadata?: NotificationMetadata): Promise<void>;
}
