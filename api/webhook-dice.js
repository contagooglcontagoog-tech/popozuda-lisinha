module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const ev     = req.body;
  const status = ev.status || ev.state || '';

  console.log('[Popozuda Webhook]', status, ev.id, ev.amount, ev.product_name);

  if (status === 'PAID' || status === 'APPROVED') {
    // Extensão futura: notificar Telegram, disparar e-mail, etc.
  }

  return res.sendStatus(200);
};
