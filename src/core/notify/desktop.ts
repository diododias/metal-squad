import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { NotificationChannel } from './types.js';
import { logCaughtError } from '../events/logging.js';

const execFileAsync = promisify(execFile);
const TITLE = 'metal-squad';

export class DesktopChannel implements NotificationChannel {
  public readonly name = 'desktop';

  public async send(message: string, _metadata?: Record<string, unknown>): Promise<void> {
    try {
      const { platform } = process;
      if (platform === 'darwin') {
        const escaped = message.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        await execFileAsync('osascript', [
          '-e',
          `display notification "${escaped}" with title "${TITLE}"`,
        ]);
      } else if (platform === 'linux') {
        await execFileAsync('notify-send', [TITLE, message]);
      } else if (platform === 'win32') {
        const ps = [
          '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
          `$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText01)`,
          `$t.SelectSingleNode('//text[@id=1]').InnerText = '${message.replace(/'/g, "''")}'`,
          `$n = [Windows.UI.Notifications.ToastNotification]::new($t)`,
          `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${TITLE}').Show($n)`,
        ].join('; ');
        await execFileAsync('powershell', ['-Command', ps]);
      }
    } catch (error) {
      // best-effort — a failed desktop notification must not break the run
      logCaughtError('notify/desktop.send', error);
    }
  }
}
