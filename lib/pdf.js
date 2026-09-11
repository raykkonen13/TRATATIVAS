const PDFDocument = require('pdfkit');

function formatDateBR(value) {
  if (!value) return '—';
  const d = new Date(value.length === 10 ? value + 'T00:00:00' : value);
  if (isNaN(d)) return value;
  return d.toLocaleDateString('pt-BR');
}

function gerarPDFBuffer(t) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(18).text('Tratativa de campo');
    doc.font('Helvetica').fontSize(9).fillColor('#666').text('N° ' + t.id);
    doc.fillColor('#000');
    doc.moveDown(0.6);
    doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.8);

    const campos = [
      ['Gravidade', t.gravidade + (t.codigo ? '  (' + t.codigo + ')' : '')],
      ['Situação', t.status + (t.decision ? '  — ' + (t.decision === 'aprovado' ? 'confirmado como feito' : 'confirmado como não feito') : '')],
      ['Aberta em', formatDateBR(t.created_at)],
      ['Prazo para realizar', formatDateBR(t.prazo)],
      ['Supervisor', t.supervisor || '—'],
      ['Encarregado', t.encarregado || '—'],
      ['Lançado por', t.lancado_por || '—'],
      ['Frota', t.frota || '—'],
      ['Placa', t.placa || '—'],
      ['Destinatário principal', t.email || '—'],
      ['Em cópia', t.cc && t.cc.length ? t.cc.join(', ') : '—'],
    ];
    doc.fontSize(10.5);
    campos.forEach(([label, value]) => {
      doc.font('Helvetica-Bold').text(label + ': ', { continued: true });
      doc.font('Helvetica').text(String(value));
    });

    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(11).text('Descrição da ocorrência');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10.5).text(t.descricao || '—', { width: 500 });

    if (t.decision_comment) {
      doc.moveDown(0.8);
      doc.font('Helvetica-Bold').fontSize(11).text('Comentário da resposta');
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(10.5).text(t.decision_comment, { width: 500 });
    }

    if (t.foto) {
      try {
        const base64 = t.foto.includes(',') ? t.foto.split(',')[1] : t.foto;
        const buffer = Buffer.from(base64, 'base64');
        doc.moveDown(1);
        if (doc.y > 520) doc.addPage();
        doc.image(buffer, 48, doc.y, { fit: [500, 320] });
      } catch (e) {
        // ignora imagem inválida
      }
    }

    doc.font('Helvetica').fontSize(8).fillColor('#999').text(
      'Gerado em ' + new Date().toLocaleString('pt-BR') + ' — Tratativas de Campo',
      48, 800, { width: 500 }
    );

    doc.end();
  });
}

function gerarRelatorioBuffer(lista) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(16).text('Relatório de tratativas de campo');
    doc.font('Helvetica').fontSize(9).fillColor('#666').text(new Date().toLocaleDateString('pt-BR'));
    doc.fillColor('#000');
    doc.moveDown(1);

    lista.forEach((t, i) => {
      if (doc.y > 740) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(10).text(`${i + 1}. ${t.gravidade}${t.codigo ? ' (' + t.codigo + ')' : ''} — ${t.status}`);
      doc.font('Helvetica').fontSize(9).text(
        `${t.descricao || ''}  |  Supervisor: ${t.supervisor || '—'}  |  Lançado por: ${t.lancado_por || '—'}  |  Frota/Placa: ${t.frota || '—'}/${t.placa || '—'}  |  Prazo: ${formatDateBR(t.prazo)}`
      );
      doc.moveDown(0.6);
    });

    doc.end();
  });
}

module.exports = { gerarPDFBuffer, gerarRelatorioBuffer, formatDateBR };
