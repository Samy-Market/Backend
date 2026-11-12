import { Logger } from '@nestjs/common';
import { MailMessage, Mailer } from '../../application/ports/mailer';

/** Sin BREVO_API_KEY (desarrollo): el correo se escribe en el log en vez de enviarse. */
export class LogMailer extends Mailer {
  private readonly logger = new Logger('Correo');

  send(m: MailMessage): Promise<void> {
    this.logger.warn(`[sin enviar] Para: ${m.to} · ${m.subject}\n${m.text}`);
    return Promise.resolve();
  }
}
