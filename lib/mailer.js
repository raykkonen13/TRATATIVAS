const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const FROM_EMAIL = process.env.FROM_EMAIL || process.env.SMTP_USER;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

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

  await transporter.sendMail({
    from: FROM_EMAIL,
    to: t.email,
    cc: t.cc && t.cc.length ? t.cc.join(',') : undefined,
    subject: `Tratativa de campo — ${t.gravidade}${t.codigo ? ' (' + t.codigo + ')' : ''} — aguardando sua resposta`,
    html,
    attachments: [{ filename: `tratativa-${t.id}.pdf`, content: pdfBuffer }]
  });
}

module.exports = { enviarEmailTratativa };
