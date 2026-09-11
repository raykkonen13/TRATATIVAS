require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const supabase = require('./lib/supabase');
const { gerarPDFBuffer, gerarRelatorioBuffer, formatDateBR } = require('./lib/pdf');
const { enviarEmailTratativa } = require('./lib/mailer');

const PORT = process.env.PORT || 3000;
const APP_USER = process.env.APP_USER || 'admin';
const APP_PASS = process.env.APP_PASS || 'admin';
const SESSION_SECRET = process.env.SESSION_SECRET || 'troque-este-segredo';
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- sessão (cookie assinado, sem dependência externa) ----------
function sign(value) {
  const h = crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
  return `${value}.${h}`;
}
function verify(signed) {
  if (!signed) return null;
  const idx = signed.lastIndexOf('.');
  if (idx < 0) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return crypto.timingSafeEqual(a, b) ? value : null;
}
function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((p) => {
    const idx = p.indexOf('=');
    if (idx > -1) out[p.slice(0, idx).trim()] = decodeURIComponent(p.slice(idx + 1).trim());
  });
  return out;
}
function isAuthed(req) {
  return verify(parseCookies(req).session) === 'ok';
}
function setSessionCookie(res) {
  res.setHeader('Set-Cookie', `session=${encodeURIComponent(sign('ok'))}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
}

// ---------- leitura do corpo da requisição ----------
function readBody(req, limit = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(new Error('Corpo da requisição muito grande.')); req.destroy(); return; }
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
async function readJSON(req) {
  const raw = await readBody(req);
  return raw ? JSON.parse(raw) : {};
}
function parseFormEncoded(raw) {
  const out = {};
  new URLSearchParams(raw).forEach((v, k) => { out[k] = v; });
  return out;
}

// ---------- respostas utilitárias ----------
function sendJSON(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function sendHTML(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}
function paginaSimples(titulo, mensagem, cor) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title>
  <style>
    body{font-family:Arial,sans-serif;background:#11151A;color:#E8EBEF;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;}
    .box{max-width:420px;text-align:center;background:#1A2029;border:1px solid #2B3441;border-radius:14px;padding:32px 26px;}
    h1{font-size:1.2rem;margin-bottom:10px;color:${cor || '#E8EBEF'};}
    p{color:#93A0B0;font-size:0.92rem;line-height:1.6;}
  </style></head><body><div class="box"><h1>${titulo}</h1><p>${mensagem}</p></div></body></html>`;
}
function paginaConfirmacao(titulo, corBotao, textoBotao, formAction, extraCampo) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title>
  <style>
    body{font-family:Arial,sans-serif;background:#11151A;color:#E8EBEF;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;}
    .box{max-width:440px;width:100%;background:#1A2029;border:1px solid #2B3441;border-radius:14px;padding:32px 26px;}
    h1{font-size:1.15rem;margin-bottom:14px;}
    textarea{width:100%;min-height:80px;border-radius:8px;border:1px solid #374050;background:#212836;color:#E8EBEF;padding:10px;font-family:Arial,sans-serif;margin-bottom:16px;box-sizing:border-box;}
    button{width:100%;padding:12px;border:none;border-radius:8px;background:${corBotao};color:#0C1216;font-weight:bold;font-size:0.95rem;cursor:pointer;}
  </style></head><body><div class="box">
    <h1>${titulo}</h1>
    <form method="POST" action="${formAction}">
      ${extraCampo || ''}
      <button type="submit">${textoBotao}</button>
    </form>
  </div></body></html>`;
}

// ---------- arquivos estáticos ----------
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml' };
function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { sendHTML(res, 404, 'Não encontrado'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': (MIME[ext] || 'application/octet-stream') + '; charset=utf-8' });
    res.end(data);
  });
}

// ---------- decisão de aprovar/reprovar ----------
async function processarDecisao(res, token, decisao, novoStatus, comentario) {
  const { data, error } = await supabase.from('tratativas').select('*').eq('approval_token', token).maybeSingle();
  if (error || !data) {
    return sendHTML(res, 404, paginaSimples('Link inválido', 'Não encontramos nenhuma tratativa associada a este link.', '#D6564C'));
  }
  if (data.token_used_at) {
    return sendHTML(res, 200, paginaSimples(
      'Já respondida',
      `Esta tratativa já foi marcada como <b>${data.decision === 'aprovado' ? 'feita' : 'não feita'}</b> em ${formatDateBR(data.decision_at)}.`,
      '#93A0B0'
    ));
  }
  await supabase.from('tratativas').update({
    status: novoStatus,
    decision: decisao,
    decision_comment: comentario,
    decision_at: new Date().toISOString(),
    token_used_at: new Date().toISOString()
  }).eq('id', data.id);

  return sendHTML(res, 200, paginaSimples(
    decisao === 'aprovado' ? 'Obrigado pela confirmação!' : 'Resposta registrada',
    decisao === 'aprovado'
      ? 'A tratativa foi marcada como <b>feita</b>. Quem lançou já pode acompanhar essa atualização no sistema.'
      : 'A tratativa foi marcada como <b>não feita</b>. Quem lançou vai dar continuidade.',
    decisao === 'aprovado' ? '#4C9E71' : '#D6564C'
  ));
}

// ---------- servidor ----------
const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, `http://${req.headers.host}`); }
  catch (e) { return sendHTML(res, 400, 'Requisição inválida'); }
  const pathname = url.pathname;

  try {
    // ----- login -----
    if (pathname === '/api/login' && req.method === 'POST') {
      const body = await readJSON(req);
      if (body.usuario === APP_USER && body.senha === APP_PASS) {
        setSessionCookie(res);
        return sendJSON(res, 200, { ok: true });
      }
      return sendJSON(res, 401, { ok: false, erro: 'Usuário ou senha inválidos.' });
    }
    if (pathname === '/api/logout' && req.method === 'POST') {
      clearSessionCookie(res);
      return sendJSON(res, 200, { ok: true });
    }
    if (pathname === '/api/session' && req.method === 'GET') {
      return sendJSON(res, 200, { authed: isAuthed(req) });
    }

    // ----- páginas públicas de aprovação (sem login, quem clica é o destinatário) -----
    if (pathname.startsWith('/aprovar/') && req.method === 'GET') {
      const token = pathname.split('/')[2];
      return sendHTML(res, 200, paginaConfirmacao('Confirmar tratativa como feita', '#4C9E71', 'Confirmar que foi feita', `/aprovar/${token}`));
    }
    if (pathname.startsWith('/aprovar/') && req.method === 'POST') {
      const token = pathname.split('/')[2];
      return await processarDecisao(res, token, 'aprovado', 'Concluído', null);
    }
    if (pathname.startsWith('/reprovar/') && req.method === 'GET') {
      const token = pathname.split('/')[2];
      return sendHTML(res, 200, paginaConfirmacao(
        'Confirmar que não foi feita', '#D6564C', 'Confirmar que não foi feita', `/reprovar/${token}`,
        `<textarea name="comentario" placeholder="Motivo (opcional)"></textarea>`
      ));
    }
    if (pathname.startsWith('/reprovar/') && req.method === 'POST') {
      const token = pathname.split('/')[2];
      const form = parseFormEncoded(await readBody(req));
      return await processarDecisao(res, token, 'reprovado', 'Vencido', form.comentario || null);
    }

    // ----- API protegida -----
    if (pathname === '/api/tratativas' && req.method === 'GET') {
      if (!isAuthed(req)) return sendJSON(res, 401, { erro: 'não autenticado' });
      const { data, error } = await supabase.from('tratativas').select('*').order('created_at', { ascending: false });
      if (error) return sendJSON(res, 500, { erro: error.message });
      return sendJSON(res, 200, data);
    }

    if (pathname === '/api/tratativas' && req.method === 'POST') {
      if (!isAuthed(req)) return sendJSON(res, 401, { erro: 'não autenticado' });
      const body = await readJSON(req);
      if (!body.gravidade || !body.descricao) return sendJSON(res, 400, { erro: 'Gravidade e descrição são obrigatórias.' });

      const row = {
        id: crypto.randomUUID(),
        foto: body.foto || null,
        gravidade: body.gravidade,
        codigo: body.codigo || null,
        descricao: body.descricao,
        supervisor: body.supervisor || null,
        encarregado: body.encarregado || null,
        lancado_por: body.lancadoPor || null,
        frota: body.frota || null,
        placa: body.placa || null,
        email: body.email || null,
        cc: Array.isArray(body.cc) ? body.cc.filter(Boolean) : [],
        prazo: body.prazo || null,
        status: 'Em andamento',
        approval_token: crypto.randomBytes(20).toString('hex')
      };
      const { data, error } = await supabase.from('tratativas').insert([row]).select();
      if (error) return sendJSON(res, 500, { erro: error.message });
      const created = data[0];

      if (body.enviarEmail && created.email) {
        try {
          const pdfBuffer = await gerarPDFBuffer(created);
          await enviarEmailTratativa(created, pdfBuffer);
        } catch (e) {
          console.error('Falha ao enviar e-mail:', e.message);
          return sendJSON(res, 201, { ...created, avisoEmail: 'Tratativa salva, mas o e-mail não pôde ser enviado: ' + e.message });
        }
      }
      return sendJSON(res, 201, created);
    }

    const matchReenviar = pathname.match(/^\/api\/tratativas\/([^/]+)\/reenviar$/);
    if (matchReenviar && req.method === 'POST') {
      if (!isAuthed(req)) return sendJSON(res, 401, { erro: 'não autenticado' });
      const { data: row0, error: e0 } = await supabase.from('tratativas').select('*').eq('id', matchReenviar[1]).single();
      if (e0 || !row0) return sendJSON(res, 404, { erro: 'Tratativa não encontrada.' });
      if (!row0.email) return sendJSON(res, 400, { erro: 'Esta tratativa não tem destinatário principal.' });
      let row = row0;
      if (row0.token_used_at) {
        const novoToken = crypto.randomBytes(20).toString('hex');
        const { data: upd, error: e1 } = await supabase.from('tratativas').update({
          approval_token: novoToken, token_used_at: null, decision: null, decision_comment: null, decision_at: null
        }).eq('id', row0.id).select();
        if (e1) return sendJSON(res, 500, { erro: e1.message });
        row = upd[0];
      }
      try {
        const pdfBuffer = await gerarPDFBuffer(row);
        await enviarEmailTratativa(row, pdfBuffer);
      } catch (e) {
        return sendJSON(res, 500, { erro: 'Não foi possível enviar o e-mail: ' + e.message });
      }
      return sendJSON(res, 200, { ok: true });
    }

    const matchPdf = pathname.match(/^\/api\/tratativas\/([^/]+)\/pdf$/);
    if (matchPdf && req.method === 'GET') {
      if (!isAuthed(req)) return sendJSON(res, 401, { erro: 'não autenticado' });
      const { data, error } = await supabase.from('tratativas').select('*').eq('id', matchPdf[1]).single();
      if (error || !data) return sendHTML(res, 404, 'Tratativa não encontrada');
      const buffer = await gerarPDFBuffer(data);
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="tratativa-${data.id}.pdf"` });
      return res.end(buffer);
    }

    if (pathname === '/api/relatorio.pdf' && req.method === 'GET') {
      if (!isAuthed(req)) return sendJSON(res, 401, { erro: 'não autenticado' });
      const { data, error } = await supabase.from('tratativas').select('*').order('created_at', { ascending: false });
      if (error) return sendJSON(res, 500, { erro: error.message });
      const buffer = await gerarRelatorioBuffer(data);
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="relatorio-tratativas.pdf"' });
      return res.end(buffer);
    }

    const matchId = pathname.match(/^\/api\/tratativas\/([^/]+)$/);
    if (matchId && req.method === 'PATCH') {
      if (!isAuthed(req)) return sendJSON(res, 401, { erro: 'não autenticado' });
      const body = await readJSON(req);
      const { data, error } = await supabase.from('tratativas').update({ status: body.status }).eq('id', matchId[1]).select();
      if (error) return sendJSON(res, 500, { erro: error.message });
      return sendJSON(res, 200, data[0]);
    }
    if (matchId && req.method === 'DELETE') {
      if (!isAuthed(req)) return sendJSON(res, 401, { erro: 'não autenticado' });
      const { error } = await supabase.from('tratativas').delete().eq('id', matchId[1]);
      if (error) return sendJSON(res, 500, { erro: error.message });
      return sendJSON(res, 200, { ok: true });
    }

    // ----- páginas / estáticos -----
    if (pathname === '/') {
      return serveStatic(res, path.join(PUBLIC_DIR, isAuthed(req) ? 'app.html' : 'login.html'));
    }

    const staticPath = path.join(PUBLIC_DIR, pathname);
    if (staticPath.startsWith(PUBLIC_DIR) && fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
      return serveStatic(res, staticPath);
    }

    return sendHTML(res, 404, 'Página não encontrada');
  } catch (e) {
    console.error(e);
    return sendJSON(res, 500, { erro: e.message });
  }
});

server.listen(PORT, () => console.log('Tratativas de Campo rodando na porta ' + PORT));
