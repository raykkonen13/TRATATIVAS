(function(){
  const state = { tratativas: [], fotoAtual: null, sevAtual: null };

  // ---------- API ----------
  async function api(path, options){
    options = options || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    const res = await fetch(path, Object.assign({ credentials: 'same-origin' }, options, { headers }));
    if(res.status === 401){ window.location.href = '/'; throw new Error('não autenticado'); }
    return res;
  }

  async function carregar(){
    try{
      const r = await api('/api/tratativas');
      state.tratativas = await r.json();
    }catch(e){ state.tratativas = []; }
    render();
  }

  // ---------- util ----------
  function formatDate(iso){
    if(!iso) return '—';
    const d = new Date(iso.length===10 ? iso+'T00:00:00' : iso);
    if(isNaN(d)) return iso;
    return d.toLocaleDateString('pt-BR');
  }
  function todayISO(){ const d=new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); }
  function isOverdue(t){ return t.status !== 'Concluído' && t.prazo && t.prazo < todayISO(); }
  function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function toast(msg){
    const el = document.getElementById('toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>el.classList.remove('show'), 4200);
  }

  // ---------- logout ----------
  const btnLogout = document.getElementById('btn-logout');
  if(btnLogout) btnLogout.addEventListener('click', async ()=>{
    await fetch('/api/logout', { method:'POST' });
    window.location.href = '/';
  });

  // ---------- tabs ----------
  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
      document.getElementById('view-'+btn.dataset.view).classList.add('active');
    });
  });

  // ---------- foto ----------
  const fotoInput = document.getElementById('foto-input');
  const photoPreview = document.getElementById('photo-preview');
  const photoPlaceholder = document.getElementById('photo-placeholder');
  fotoInput.addEventListener('change', e=>{
    const file = e.target.files[0];
    if(!file) return;
    comprimirImagem(file).then(dataUrl=>{
      state.fotoAtual = dataUrl;
      photoPreview.src = dataUrl;
      photoPreview.style.display = 'block';
      photoPlaceholder.style.display = 'none';
    });
  });
  function comprimirImagem(file, maxW=1100, quality=0.72){
    return new Promise(resolve=>{
      const reader = new FileReader();
      reader.onload = e=>{
        const img = new Image();
        img.onload = ()=>{
          let w = img.width, h = img.height;
          if(w > maxW){ h = h*(maxW/w); w = maxW; }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img,0,0,w,h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------- gravidade ----------
  document.querySelectorAll('.sev-opt').forEach(opt=>{
    opt.addEventListener('click', ()=>{
      document.querySelectorAll('.sev-opt').forEach(o=>o.classList.remove('selected'));
      opt.classList.add('selected');
      state.sevAtual = opt.dataset.sev;
      popularCodigos(state.sevAtual);
    });
  });

  // ---------- código da NC (depende da gravidade) ----------
  function popularCodigos(gravidade){
    const sel = document.getElementById('codigo-input');
    const hint = document.getElementById('codigo-desc-hint');
    const lista = gravidade && window.NC_CODES ? window.NC_CODES[gravidade] : null;
    if(!lista){
      sel.innerHTML = '<option value="">Selecione a gravidade acima primeiro</option>';
      sel.disabled = true;
      if(hint) hint.textContent = '';
      return;
    }
    sel.disabled = false;
    sel.innerHTML = '<option value="">Selecione o código da NC</option>' +
      lista.map(item=>`<option value="${item.code}">${item.code} — ${escapeHtml(item.desc.length>68 ? item.desc.slice(0,68)+'…' : item.desc)}</option>`).join('');
    if(hint) hint.textContent = '';
  }
  document.getElementById('codigo-input').addEventListener('change', ()=>{
    const hint = document.getElementById('codigo-desc-hint');
    const lista = state.sevAtual && window.NC_CODES ? window.NC_CODES[state.sevAtual] : null;
    const val = document.getElementById('codigo-input').value;
    const item = lista ? lista.find(i=>i.code===val) : null;
    if(hint) hint.textContent = item ? item.desc : '';
  });

  // ---------- form ----------
  document.getElementById('btn-limpar').addEventListener('click', resetForm);
  function resetForm(){
    document.getElementById('form-tratativa').reset();
    state.fotoAtual = null;
    state.sevAtual = null;
    photoPreview.style.display = 'none';
    photoPlaceholder.style.display = 'flex';
    document.querySelectorAll('.sev-opt').forEach(o=>o.classList.remove('selected'));
    popularCodigos(null);
  }

  document.getElementById('form-tratativa').addEventListener('submit', async e=>{
    e.preventDefault();
    const descricao = document.getElementById('descricao-input').value.trim();
    const supervisor = document.getElementById('supervisor-input').value.trim();
    const encarregado = document.getElementById('encarregado-input').value.trim();
    const lancadoPor = document.getElementById('lancador-input').value.trim();
    const frota = document.getElementById('frota-input').value.trim();
    const placa = document.getElementById('placa-input').value.trim();
    const email = document.getElementById('email-input').value.trim();

    if(!state.sevAtual){ toast('Escolha a gravidade do ocorrido.'); return; }
    if(!descricao){ toast('Descreva a ocorrência.'); return; }
    if(!supervisor){ toast('Informe o nome do supervisor.'); return; }
    if(!lancadoPor){ toast('Informe quem está lançando a tratativa.'); return; }

    const payload = {
      foto: state.fotoAtual,
      gravidade: state.sevAtual,
      codigo: document.getElementById('codigo-input').value.trim(),
      descricao, supervisor, encarregado, lancadoPor, frota, placa, email,
      cc: [
        document.getElementById('cc1-input').value.trim(),
        document.getElementById('cc2-input').value.trim(),
        document.getElementById('cc3-input').value.trim(),
        document.getElementById('cc4-input').value.trim()
      ].filter(Boolean),
      prazo: document.getElementById('prazo-input').value,
      enviarEmail: !!email
    };

    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Salvando...';
    try{
      const r = await api('/api/tratativas', { method:'POST', body: JSON.stringify(payload) });
      const created = await r.json();
      resetForm();
      await carregar();
      if(created.avisoEmail) toast(created.avisoEmail);
      else if(email) toast('Tratativa salva e e-mail enviado ao destinatário principal.');
      else toast('Tratativa salva.');
      document.querySelector('.tab-btn[data-view="lista"]').click();
    }catch(err){
      toast('Não foi possível salvar a tratativa.');
    }finally{
      btn.disabled = false; btn.textContent = 'Salvar tratativa';
    }
  });

  // ---------- filtros ----------
  document.getElementById('filtro-status').addEventListener('change', renderLista);
  document.getElementById('filtro-gravidade').addEventListener('change', renderLista);
  document.getElementById('filtro-placa').addEventListener('input', renderLista);
  ['filtro-lista-dia','filtro-lista-mes','filtro-lista-ano'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.addEventListener('change', renderLista);
  });

  // ---------- render ----------
  function render(){ renderStats(); renderLista(); popularFiltrosData(); renderPainel(); }

  function renderStats(){
    const list = state.tratativas;
    document.getElementById('stat-total').textContent = list.length;
    document.getElementById('stat-andamento').textContent = list.filter(t=>t.status==='Em andamento').length;
    document.getElementById('stat-concluido').textContent = list.filter(t=>t.status==='Concluído').length;
    document.getElementById('stat-vencido').textContent = list.filter(t=>t.status==='Vencido' || isOverdue(t)).length;
    const recorrentes = calcularRecorrenciaPorFrota(list);
    document.getElementById('stat-recorrencia').textContent = Object.keys(recorrentes).length;
  }

  function renderLista(){
    const container = document.getElementById('lista-container');
    const fStatus = document.getElementById('filtro-status').value;
    const fGrav = document.getElementById('filtro-gravidade').value;
    const fPlaca = document.getElementById('filtro-placa').value.trim().toLowerCase();
    let list = state.tratativas.filter(t=>{
      if(fStatus && t.status !== fStatus) return false;
      if(fGrav && t.gravidade !== fGrav) return false;
      if(fPlaca && !((t.placa||'').toLowerCase().includes(fPlaca) || (t.frota||'').toLowerCase().includes(fPlaca))) return false;
      if(!passaFiltroData(t, 'filtro-lista-dia', 'filtro-lista-mes', 'filtro-lista-ano')) return false;
      return true;
    });

    if(list.length === 0){
      container.innerHTML = `<div class="empty">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>
        <div>Nenhuma tratativa encontrada.</div>
      </div>`;
      return;
    }

    container.innerHTML = list.map(t=>{
      const thumb = t.foto
        ? `<img class="thumb" src="${t.foto}" alt="">`
        : `<div class="thumb empty-thumb"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3"/></svg></div>`;
      const overdue = isOverdue(t);
      const decisao = t.decision === 'aprovado' ? '✓ confirmado como feito' : t.decision === 'reprovado' ? '✕ confirmado como não feito' : '';
      return `
      <div class="list-item" data-id="${t.id}">
        ${thumb}
        <div class="li-main">
          <div class="li-top">
            <span class="badge ${t.gravidade}">${t.gravidade}${t.codigo ? ' · '+escapeHtml(t.codigo) : ''}</span>
            <span class="badge status-${t.status.replace(' ','-')}">${t.status}</span>
            ${overdue ? '<span class="badge status-Vencido">Prazo estourado</span>' : ''}
          </div>
          <p class="li-title">${escapeHtml(t.descricao)}</p>
          <div class="li-meta">
            <span>Supervisor: ${escapeHtml(t.supervisor)||'—'}</span>
            <span>Encarregado: ${escapeHtml(t.encarregado)||'—'}</span>
            <span>Lançado por: ${escapeHtml(t.lancado_por)||'—'}</span>
            ${t.frota ? `<span>Frota: ${escapeHtml(t.frota)}</span>` : ''}
            ${t.placa ? `<span>Placa: ${escapeHtml(t.placa)}</span>` : ''}
            <span>Prazo: ${formatDate(t.prazo)}</span>
            ${decisao ? `<span>${decisao}</span>` : (t.email ? '<span>Aguardando resposta do destinatário</span>' : '')}
          </div>
        </div>
        <div class="li-actions">
          <select class="btn btn-sm status-select" data-id="${t.id}">
            <option ${t.status==='Em andamento'?'selected':''}>Em andamento</option>
            <option ${t.status==='Concluído'?'selected':''}>Concluído</option>
            <option ${t.status==='Vencido'?'selected':''}>Vencido</option>
          </select>
          <div class="row">
            <button class="btn btn-sm btn-ver" data-id="${t.id}">Ver</button>
            <button class="btn btn-sm btn-pdf" data-id="${t.id}">PDF</button>
            ${t.email ? `<button class="btn btn-sm btn-reenviar" data-id="${t.id}">Reenviar e-mail</button>` : ''}
            <button class="btn btn-sm btn-danger btn-excluir" data-id="${t.id}">Excluir</button>
          </div>
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('.status-select').forEach(sel=>{
      sel.addEventListener('change', async ()=>{
        try{
          await api('/api/tratativas/'+sel.dataset.id, { method:'PATCH', body: JSON.stringify({ status: sel.value }) });
          await carregar();
        }catch(e){ toast('Não foi possível atualizar o status.'); }
      });
    });
    container.querySelectorAll('.btn-ver').forEach(b=>b.addEventListener('click', ()=>verDetalhe(b.dataset.id)));
    container.querySelectorAll('.btn-pdf').forEach(b=>b.addEventListener('click', ()=>{
      window.open('/api/tratativas/'+b.dataset.id+'/pdf', '_blank');
    }));
    container.querySelectorAll('.btn-reenviar').forEach(b=>b.addEventListener('click', async ()=>{
      b.disabled = true; b.textContent = 'Enviando...';
      try{
        await api('/api/tratativas/'+b.dataset.id+'/reenviar', { method:'POST' });
        toast('E-mail reenviado.');
        await carregar();
      }catch(e){ toast('Não foi possível reenviar o e-mail.'); }
    }));
    container.querySelectorAll('.btn-excluir').forEach(b=>b.addEventListener('click', async ()=>{
      if(!confirm('Excluir esta tratativa?')) return;
      try{
        await api('/api/tratativas/'+b.dataset.id, { method:'DELETE' });
        await carregar();
      }catch(e){ toast('Não foi possível excluir.'); }
    }));
  }

  // ---------- detalhe ----------
  function verDetalhe(id){
    const t = state.tratativas.find(x=>x.id===id);
    const modal = document.getElementById('modal-content');
    modal.innerHTML = `
      <h3>Detalhe da tratativa</h3>
      ${t.foto ? `<img src="${t.foto}" alt="">` : ''}
      <dl>
        <dt>Gravidade</dt><dd>${t.gravidade}${t.codigo ? ' — '+escapeHtml(t.codigo) : ''}</dd>
        <dt>Situação</dt><dd>${t.status}${isOverdue(t) ? ' (prazo estourado)' : ''}</dd>
        <dt>Descrição</dt><dd>${escapeHtml(t.descricao)}</dd>
        <dt>Supervisor</dt><dd>${escapeHtml(t.supervisor)||'—'}</dd>
        <dt>Encarregado</dt><dd>${escapeHtml(t.encarregado)||'—'}</dd>
        <dt>Lançado por</dt><dd>${escapeHtml(t.lancado_por)||'—'}</dd>
        <dt>Frota</dt><dd>${escapeHtml(t.frota)||'—'}</dd>
        <dt>Placa</dt><dd>${escapeHtml(t.placa)||'—'}</dd>
        <dt>Destinatário principal</dt><dd>${escapeHtml(t.email)||'—'}</dd>
        <dt>Em cópia</dt><dd>${(t.cc && t.cc.length) ? t.cc.map(escapeHtml).join(', ') : '—'}</dd>
        <dt>Prazo</dt><dd>${formatDate(t.prazo)}</dd>
        <dt>Aberta em</dt><dd>${formatDate(t.created_at)}</dd>
        ${t.decision ? `<dt>Resposta do destinatário</dt><dd>${t.decision === 'aprovado' ? 'Confirmado como feito' : 'Confirmado como não feito'} em ${formatDate(t.decision_at)}${t.decision_comment ? ' — "'+escapeHtml(t.decision_comment)+'"' : ''}</dd>` : ''}
      </dl>
      <div class="close-row"><button class="btn btn-primary" id="btn-fechar-modal">Fechar</button></div>
    `;
    document.getElementById('modal-bg').classList.add('show');
    document.getElementById('btn-fechar-modal').addEventListener('click', ()=>{
      document.getElementById('modal-bg').classList.remove('show');
    });
  }
  document.getElementById('modal-bg').addEventListener('click', e=>{
    if(e.target.id === 'modal-bg') e.target.classList.remove('show');
  });

  // ---------- relatório ----------
  document.getElementById('btn-relatorio').addEventListener('click', ()=>{
    window.open('/api/relatorio.pdf', '_blank');
  });

  // ---------- painel / filtros de data ----------
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  function popularSelectData(diaId, mesId, anoId){
    const diaSel = document.getElementById(diaId);
    const mesSel = document.getElementById(mesId);
    const anoSel = document.getElementById(anoId);
    if(!diaSel || !mesSel || !anoSel) return;

    if(!diaSel.dataset.pronto){
      diaSel.innerHTML = '<option value="">Todos os dias</option>' +
        Array.from({length:31}, (_,i)=>i+1).map(d=>`<option value="${d}">${String(d).padStart(2,'0')}</option>`).join('');
      diaSel.dataset.pronto = '1';
    }
    if(!mesSel.dataset.pronto){
      mesSel.innerHTML = '<option value="">Todos os meses</option>' +
        MESES.map((m,i)=>`<option value="${i+1}">${m}</option>`).join('');
      mesSel.dataset.pronto = '1';
    }

    const anoAtual = anoSel.value;
    const anos = Array.from(new Set(state.tratativas.map(t=>new Date(t.created_at).getFullYear()))).sort((a,b)=>b-a);
    anoSel.innerHTML = '<option value="">Todos os anos</option>' + anos.map(a=>`<option value="${a}">${a}</option>`).join('');
    if(anos.includes(Number(anoAtual))) anoSel.value = anoAtual;
  }

  function popularFiltrosData(){
    popularSelectData('filtro-dia', 'filtro-mes', 'filtro-ano');
    popularSelectData('filtro-lista-dia', 'filtro-lista-mes', 'filtro-lista-ano');
  }

  ['filtro-dia','filtro-mes','filtro-ano'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.addEventListener('change', renderPainel);
  });

  function passaFiltroData(t, diaId, mesId, anoId){
    const dia = document.getElementById(diaId)?.value;
    const mes = document.getElementById(mesId)?.value;
    const ano = document.getElementById(anoId)?.value;
    if(!dia && !mes && !ano) return true;
    if(!t.created_at) return false;
    const d = new Date(t.created_at);
    if(dia && d.getDate() !== Number(dia)) return false;
    if(mes && (d.getMonth()+1) !== Number(mes)) return false;
    if(ano && d.getFullYear() !== Number(ano)) return false;
    return true;
  }

  function tratativasFiltradasPainel(){
    return state.tratativas.filter(t=>passaFiltroData(t, 'filtro-dia', 'filtro-mes', 'filtro-ano'));
  }

  const CORES_FROTA = ['#3E93A6','#E0A83E','#D6564C','#4C9E71','#8B6FD6','#D67AB8','#6FA8D6','#B8A24C','#5CBFAE','#C97C4C'];

  function calcularRecorrenciaPorFrota(list){
    // recorrente = a mesma frota tem 2 ou mais tratativas lançadas com a mesma gravidade
    const porFrotaGravidade = {};
    list.forEach(t=>{
      if(!t.frota) return;
      const chave = t.frota + '||' + t.gravidade;
      porFrotaGravidade[chave] = (porFrotaGravidade[chave] || 0) + 1;
    });
    const totalPorFrota = {};
    Object.entries(porFrotaGravidade).forEach(([chave, qtd])=>{
      if(qtd < 2) return;
      const frota = chave.split('||')[0];
      totalPorFrota[frota] = (totalPorFrota[frota] || 0) + qtd;
    });
    return totalPorFrota;
  }

  function renderPainel(){
    const painel = document.getElementById('view-painel');
    if(!painel) return;
    const list = tratativasFiltradasPainel();

    const contagem = { 'Em andamento':0, 'Concluído':0, 'Vencido':0 };
    list.forEach(t=>{ if(contagem.hasOwnProperty(t.status)) contagem[t.status]++; });
    drawPieChart('chart-status', [
      { label:'Em andamento', value: contagem['Em andamento'], color:'#3E93A6' },
      { label:'Concluído', value: contagem['Concluído'], color:'#4C9E71' },
      { label:'Vencido', value: contagem['Vencido'], color:'#D6564C' }
    ], 'Nenhuma tratativa no período selecionado.');

    const totalPorFrota = calcularRecorrenciaPorFrota(list);
    const dadosFrota = Object.entries(totalPorFrota)
      .sort((a,b)=>b[1]-a[1])
      .map(([frota, qtd], i)=>({ label: frota, value: qtd, color: CORES_FROTA[i % CORES_FROTA.length] }));
    drawPieChart('chart-frotas', dadosFrota, 'Nenhuma frota com não conformidades recorrentes no período selecionado.');
  }

  function drawPieChart(containerId, dados, mensagemVazia){
    const container = document.getElementById(containerId);
    if(!container) return;
    const total = dados.reduce((s,d)=>s+d.value, 0);
    if(total === 0){
      container.innerHTML = `<div class="chart-empty">${mensagemVazia}</div>`;
      return;
    }
    const cx=110, cy=110, r=100;
    let anguloAtual = -90;
    let paths = '';
    const fatias = dados.filter(d=>d.value > 0);
    if(fatias.length === 1){
      paths = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fatias[0].color}"></circle>`;
    }else{
      fatias.forEach(d=>{
        const angulo = (d.value/total)*360;
        const fim = anguloAtual + angulo;
        const large = angulo > 180 ? 1 : 0;
        const x1 = cx + r*Math.cos(anguloAtual*Math.PI/180);
        const y1 = cy + r*Math.sin(anguloAtual*Math.PI/180);
        const x2 = cx + r*Math.cos(fim*Math.PI/180);
        const y2 = cy + r*Math.sin(fim*Math.PI/180);
        paths += `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${d.color}"></path>`;
        anguloAtual = fim;
      });
    }
    const legenda = fatias.map(d=>{
      const pct = ((d.value/total)*100).toFixed(1);
      return `<div class="legend-item"><span class="swatch" style="background:${d.color}"></span>${escapeHtml(d.label)} — ${d.value} (${pct}%)</div>`;
    }).join('');
    container.innerHTML = `
      <svg viewBox="0 0 220 220" width="220" height="220">${paths}</svg>
      <div class="legend">${legenda}</div>
    `;
  }

  carregar();
})();
