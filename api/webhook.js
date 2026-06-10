export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
 
  // Mercado Pago envia GET para verificar o endpoint
  if(req.method === 'GET'){
    return res.status(200).json({ status: 'ok' });
  }
 
  if(req.method !== 'POST'){
    return res.status(405).json({ error: 'Method not allowed' });
  }
 
  try {
    const body = req.body;
    console.log('Webhook recebido:', JSON.stringify(body));
 
    // Mercado Pago envia notificação de assinatura
    const topic = body.type || body.topic;
    const id = body.data ? body.data.id : body.id;
 
    if(!topic || !id){
      return res.status(200).json({ status: 'ignored' });
    }
 
    // Processar apenas eventos de assinatura
    if(topic === 'subscription_preapproval' || topic === 'subscription_authorized_payment'){
      const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
 
      // Buscar detalhes da assinatura no Mercado Pago
      const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
        headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
      });
 
      if(!mpRes.ok){
        console.log('Erro ao buscar assinatura MP:', mpRes.status);
        return res.status(200).json({ status: 'error fetching' });
      }
 
      const assinatura = await mpRes.json();
      console.log('Assinatura:', JSON.stringify(assinatura));
 
      const status = assinatura.status;
      const email = assinatura.payer_email;
      const planId = assinatura.preapproval_plan_id;
 
      // Mapear plan_id para nome do plano
      const planos = {
        '7e6bc72dacd9472983c2b5637079586c': 'ambar',
        '7f6cd35e1b594f33ad661e80e946a20b': 'rubi',
        'e496ff4f4fdc4c63bc28ff569c1a6ca6': 'diamante'
      };
      const plano = planos[planId] || 'ambar';
 
      // Supabase — atualizar status do usuário
      const SUPABASE_URL = 'https://fdbcpcvojftwohlnhcrt.supabase.co';
      const SUPABASE_KEY = process.env.ANTHROPIC_API_KEY; // usa service key
      const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
 
      if(status === 'authorized'){
        // Pagamento aprovado — liberar acesso
        const updateRes = await fetch(
          `${SUPABASE_URL}/rest/v1/usuarios?email=eq.${encodeURIComponent(email)}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_SERVICE_KEY || 'sb_publishable_R0G-yIAQxo79FIIhxULT3Q_VpQuIPrp',
              'Authorization': `Bearer ${SUPABASE_SERVICE_KEY || 'sb_publishable_R0G-yIAQxo79FIIhxULT3Q_VpQuIPrp'}`,
              'Prefer': 'return=representation'
            },
            body: JSON.stringify({
              plano: plano,
              plano_ativo: true,
              data_assinatura: new Date().toISOString()
            })
          }
        );
        console.log('Usuario atualizado:', await updateRes.text());
 
      } else if(status === 'cancelled' || status === 'paused'){
        // Assinatura cancelada — revogar acesso
        await fetch(
          `${SUPABASE_URL}/rest/v1/usuarios?email=eq.${encodeURIComponent(email)}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_SERVICE_KEY || 'sb_publishable_R0G-yIAQxo79FIIhxULT3Q_VpQuIPrp',
              'Authorization': `Bearer ${SUPABASE_SERVICE_KEY || 'sb_publishable_R0G-yIAQxo79FIIhxULT3Q_VpQuIPrp'}`,
              'Prefer': 'return=representation'
            },
            body: JSON.stringify({
              plano: 'nenhum',
              plano_ativo: false
            })
          }
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
