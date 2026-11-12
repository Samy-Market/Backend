import { BrevoMailer } from './brevo-mailer';

describe('Envío con Brevo', () => {
  const message = { to: 'ana@empresa.com', subject: 'Asunto', html: '<p>Hola</p>', text: 'Hola' };
  afterEach(() => jest.restoreAllMocks());

  it('llama a la API de Brevo con la clave, el remitente y el destinatario', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{"messageId":"1"}', { status: 201 }));
    await new BrevoMailer('clave-xyz', { email: 'no-reply@samy.ec', name: 'SAMY' }).send(message);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((init!.headers as Record<string, string>)['api-key']).toBe('clave-xyz');
    expect(JSON.parse(init!.body as string)).toEqual({
      sender: { email: 'no-reply@samy.ec', name: 'SAMY' },
      to: [{ email: 'ana@empresa.com' }],
      subject: 'Asunto',
      htmlContent: '<p>Hola</p>',
      textContent: 'Hola',
    });
  });

  it('si Brevo rechaza el envío, falla con el código', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{"message":"unauthorized"}', { status: 401 }));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(new BrevoMailer('mala', { email: 'a@b.c', name: 'X' }).send(message)).rejects.toThrow('Brevo 401');
  });
});
