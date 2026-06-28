import crypto from 'crypto';

const SUPABASE_URL = 'https://fdbcpcvojftwohlnhcrt.supabase.co';

function sbHeaders(key) {
  return {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Prefer': 'return=representation'
  };
}

async function liberarAcesso(email, plano) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  await fetch(
    `${SUPABASE_URL}/rest/v1/usuarios?email=eq.${encodeURIComponent(email)}`,
    { method: 'PATCH', headers: sbHeaders(key),
      body: JSON.stringify({ plano, plano_ativo: true, data_assinatura: new Date().toISOString() }) }
  );
  console.log('Acesso liberado para:', email, 'plano:', plano);
}

async function revogarAcesso(email) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  await fetch(
    `${SUPABASE_URL}/rest/v1/usuarios?email=eq.${encodeURIComponent(email)}`,
    { method: 'PATCH', headers: sbHeaders(key),
      body: JSON.stringify({ plano: 'nenhum', plano_ativo: false }) }
  );
  console.log('Acesso revogado para:', email);
}

// ─── MERCADO PAGO ───────────────────────────────────────────
async function processarMP(body) {
  const topic = body.type || body.topic;
  const id = body.data ? body.data.id : body.id;
  if(!topic || !id) return;

  if(topic === 'subscription_preapproval' || topic === 'subscription_authorized_payment'){
    const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
      headers: { 'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    if(!mpRes.ok) return;

    const assinatura = await mpRes.json();
    const status = assinatura.status;
    const email = assinatura.payer_email;
    const planId = assinatura.preapproval_plan_id;

    const planos = {
      '7e6bc72dacd9472983c2b5637079586c': 'ambar',
      '7f6cd35e1b594f33ad661e80e946a20b': 'rubi',
      'e496ff4f4fdc4c63bc28ff569c1a6ca6': 'diamante'
    };
    const plano = planos[planId] || 'ambar';

    if(status === 'authorized') await liberarAcesso(email, plano);
    else if(status === 'cancelled' || status === 'paused') await revogarAcesso(email);
  }
}

// ─── KIWIFY ────────────────────────────────────────────────
async function processarKiwify(body) {
  const evento = body.event || body.type;
  const email = body.Customer?.email || body.customer?.email || body.email;
  const productId = body.Product?.id || body.product?.id || '';

  console.log('Kiwify evento:', evento, 'email:', email, 'product:', productId);

  // Mapear produto para plano
  const planos = {
    'xzGhuCi': 'ambar',
    '9j2PtqK': 'rubi',
    'QFzzL7g': 'diamante'
  };

  // Tenta identificar o plano pelo checkout_id ou product id
  const checkoutId = body.Product?.checkout_id || body.product?.checkout_id || '';
  const plano = planos[checkoutId] || planos[productId] || 'ambar';

  if(!email) { console.log('Kiwify: email não encontrado'); return; }

  if(evento === 'order_approved' || evento === 'purchase_approved' ||
     evento === 'subscription_renewed' || evento === 'compra_aprovada') {
    await liberarAcesso(email, plano);
  } else if(evento === 'subscription_canceled' || evento === 'refund' ||
            evento === 'assinatura_cancelada' || evento === 'reembolso') {
    await revogarAcesso(email);
  }
}

// ─── HANDLER PRINCIPAL ─────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if(req.method === 'GET') return res.status(200).json({ status: 'ok' });
  if(req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;
    console.log('Webhook recebido:', JSON.stringify(body));

    // Detecta origem — Kiwify envia token no header ou no body
    const kiwifyToken = req.headers['x-kiwify-token'] ||
                        req.headers['authorization'] ||
                        body.token;

    if(kiwifyToken && kiwifyToken === process.env.KIWIFY_WEBHOOK_TOKEN){
      await processarKiwify(body);
    } else {
      // Valida assinatura Mercado Pago
      const secret = process.env.MP_WEBHOOK_SECRET;
      const xSignature = req.headers['x-signature'];
      if(secret && xSignature){
        const xRequestId = req.headers['x-request-id'];
        const dataId = body && body.data ? body.data.id : '';
        const parts = xSignature.split(',');
        let ts = '', v1 = '';
        parts.forEach(p => {
          const [k, v] = p.trim().split('=');
          if(k === 'ts') ts = v;
          if(k === 'v1') v1 = v;
        });
        const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
        const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
        if(hmac !== v1){
          console.log('Assinatura MP invalida — tentando processar mesmo assim');
        }
      }
      await processarMP(body);
    }

    return res.status(200).json({ status: 'processed' });
  } catch(e){
    console.error('Erro webhook:', e);
    return res.status(200).json({ status: 'error', message: e.message });
  }
}
