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
    });
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

  // ---------- render ----------
  function render(){ renderStats(); renderLista(); }

  function renderStats(){
    const list = state.tratativas;
    document.getElementById('stat-total').textContent = list.length;
    document.getElementById('stat-andamento').textContent = list.filter(t=>t.status==='Em andamento').length;
    document.getElementById('stat-concluido').textContent = list.filter(t=>t.status==='Concluído').length;
    document.getElementById('stat-vencido').textContent = list.filter(t=>t.status==='Vencido' || isOverdue(t)).length;
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

  carregar();
})();
