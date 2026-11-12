import { Logger } from '@nestjs/common';
import { MailMessage, Mailer } from '../../application/ports/mailer';

export class BrevoMailer extends Mailer {
  private readonly logger = new Logger('Correo');

  constructor(
    private apiKey: string,
    private sender: { email: string; name: string },
  ) {
    super();
  }

  async send(m: MailMessage): Promise<void> {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': this.apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: this.sender, to: [{ email: m.to }], subject: m.subject, htmlContent: m.html, textContent: m.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Brevo respondió ${res.status}: ${detail.slice(0, 300)}`);
      throw new Error(`No se pudo enviar el correo (Brevo ${res.status}).`);
    }
  }
}
