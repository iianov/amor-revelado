export default async function handler(req, res) {
  // Permite apenas POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
 
  // CORS — permite o app chamar esta função
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
 
  try {
    const { prompt, system } = req.body;
 
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt obrigatorio' });
    }
 
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: system || 'Voce e Zara, oraculo espiritual do Amor Revelado.',
        messages: [{ role: 'user', content: prompt }]
      })
    });
 
    if (!response.ok) {
      const err = await response.text();
      console.error('Erro Anthropic:', err);
      return res.status(500).json({ error: 'Erro ao consultar a Zara' });
    }
 
    const data = await response.json();
    const texto = data.content && data.content[0] ? data.content[0].text : '';
    return res.status(200).json({ texto });
 
  } catch (e) {
    console.error('Erro handler:', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
}
