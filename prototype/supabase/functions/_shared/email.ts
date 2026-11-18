/** The one email provider call (Brevo's free HTTP API). Another HTTP provider can replace it behind the same shape. */
export async function sendEmail(
  to: string, subject: string, text: string, deps: { apiKey: string; sender: string; fetch: typeof fetch },
): Promise<void> {
  const res = await deps.fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': deps.apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { email: deps.sender, name: 'Harvesting' }, to: [{ email: to }], subject, textContent: text }),
  });
  // The message names only the status: never the address, the key or the provider's reply.
  if (!res.ok) throw new Error(`email provider replied ${res.status}`);
}
