// Envio via API HTTP da Brevo (porta 443), não via SMTP.
// O Render bloqueia portas SMTP (25/465/587) de saída no plano gratuito,
// então qualquer envio por SMTP trava até dar timeout e nunca chega a sair.
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL;
const FROM_NAME = process.env.FROM_NAME || 'Tratativas de Campo';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TIMEOUT_MS = 15000;

function corPorGravidade(g) {
  if (g === 'Gravíssima') return '#D6564C';
  if (g === 'Grave') return '#E0A83E';
  return '#4C9E71';
}

async function enviarEmailTratativa(t, pdfBuffer) {
  const linkAprovar = `${BASE_URL}/aprovar/${t.approval_token}`;
  const linkReprovar = `${BASE_URL}/reprovar/${t.approval_token}`;
  const cor = corPorGravidade(t.gravidade);

  const html = `
  <div style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:560px;margin:0 auto;">
    <h2 style="margin-bottom:4px;">Tratativa de campo</h2>
    <p style="color:#666;margin-top:0;font-size:13px;">Você foi definido como responsável por avaliar esta tratativa.</p>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
      <tr><td style="padding:4px 0;color:#666;">Gravidade</td><td style="padding:4px 0;"><b style="color:${cor}">${t.gravidade}${t.codigo ? ' (' + t.codigo + ')' : ''}</b></td></tr>
      <tr><td style="padding:4px 0;color:#666;">Prazo para realizar</td><td style="padding:4px 0;">${t.prazo || '—'}</td></tr>
      <tr><td style="padding:4px 0;color:#666;">Supervisor</td><td style="padding:4px 0;">${t.supervisor || '—'}</td></tr>
      <tr><td style="padding:4px 0;color:#666;">Lançado por</td><td style="padding:4px 0;">${t.lancado_por || '—'}</td></tr>
    </table>

    <p style="font-size:14px;"><b>Descrição:</b><br>${(t.descricao || '—').replace(/\n/g, '<br>')}</p>

    <p style="font-size:13px;color:#666;">O PDF com todos os detalhes e a foto está em anexo.</p>

    <p style="margin:28px 0;">
      <a href="${linkAprovar}" style="background:#4C9E71;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;margin-right:10px;display:inline-block;">Foi feito</a>
      <a href="${linkReprovar}" style="background:#D6564C;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;display:inline-block;">Não foi feito</a>
    </p>

    <p style="font-size:12px;color:#999;">Ao clicar, você verá uma página pedindo para confirmar antes de registrar a resposta.</p>
  </div>`;

  if (!BREVO_API_KEY) throw new Error('BREVO_API_KEY não configurada.');
  if (!FROM_EMAIL) throw new Error('FROM_EMAIL não configurado.');

  const body = {
    sender: { name: FROM_NAME, email: FROM_EMAIL },
    to: [{ email: t.email }],
    subject: `Tratativa de campo — ${t.gravidade}${t.codigo ? ' (' + t.codigo + ')' : ''} — aguardando sua resposta`,
    htmlContent: html,
    attachment: [{ content: pdfBuffer.toString('base64'), name: `tratativa-${t.id}.pdf` }]
  };
  if (t.cc && t.cc.length) body.cc = t.cc.map((email) => ({ email }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Tempo esgotado ao tentar enviar o e-mail (Brevo não respondeu a tempo).');
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    let detalhe = '';
    try { detalhe = (await resp.json()).message || ''; } catch (e) { /* ignora */ }
    throw new Error(`Falha ao enviar e-mail (Brevo respondeu ${resp.status}). ${detalhe}`);
  }
}

module.exports = { enviarEmailTratativa };
