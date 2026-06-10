import crypto from 'crypto';
 
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
 
  if(req.method === 'GET'){
    return res.status(200).json({ status: 'ok' });
  }
 
  if(req.method !== 'POST'){
    return res.status(405).json({ error: 'Method not allowed' });
  }
 
  try {
    // Validar assinatura do Mercado Pago
    const secret = process.env.MP_WEBHOOK_SECRET;
    if(secret){
      const xSignature = req.headers['x-signature'];
      const xRequestId = req.headers['x-request-id'];
      const body = req.body;
      const dataId = body && body.data ? body.data.id : '';
 
      if(xSignature){
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
          console.log('Assinatura invalida');
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }
    }
 
    const body = req.body;
    console.log('Webhook recebido:', JSON.stringify(body));
 
    const topic = body.type || body.topic;
    const id = body.data ? body.data.id : body.id;
 
    if(!topic || !id){
      return res.status(200).json({ status: 'ignored' });
    }
 
    if(topic === 'subscription_preapproval' || topic === 'subscription_authorized_payment'){
      const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
 
      const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
        headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
      });
 
      if(!mpRes.ok){
        console.log('Erro ao buscar assinatura MP:', mpRes.status);
        return res.status(200).json({ status: 'error fetching' });
      }
 
      const assinatura = await mpRes.json();
      console.log('Assinatura status:', assinatura.status, 'email:', assinatura.payer_email);
 
      const status = assinatura.status;
      const email = assinatura.payer_email;
      const planId = assinatura.preapproval_plan_id;
 
      const planos = {
        '7e6bc72dacd9472983c2b5637079586c': 'ambar',
        '7f6cd35e1b594f33ad661e80e946a20b': 'rubi',
        'e496ff4f4fdc4c63bc28ff569c1a6ca6': 'diamante'
      };
      const plano = planos[planId] || 'ambar';
 
      const SUPABASE_URL = 'https://fdbcpcvojftwohlnhcrt.supabase.co';
      const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
 
      const sbHeaders = {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=representation'
      };
 
      if(status === 'authorized'){
        const updateRes = await fetch(
          `${SUPABASE_URL}/rest/v1/usuarios?email=eq.${encodeURIComponent(email)}`,
          { method: 'PATCH', headers: sbHeaders,
            body: JSON.stringify({ plano, plano_ativo: true, data_assinatura: new Date().toISOString() }) }
        );
        console.log('Acesso liberado para:', email, 'plano:', plano);
 
      } else if(status === 'cancelled' || status === 'paused'){
        await fetch(
          `${SUPABASE_URL}/rest/v1/usuarios?email=eq.${encodeURIComponent(email)}`,
          { method: 'PATCH', headers: sbHeaders,
            body: JSON.stringify({ plano: 'nenhum', plano_ativo: false }) }
        );
        console.log('Acesso revogado para:', email);
      }
    }
 
    return res.status(200).json({ status: 'processed' });
 
  } catch(e){
    console.error('Erro webhook:', e);
    return res.status(200).json({ status: 'error', message: e.message });
  }
}
