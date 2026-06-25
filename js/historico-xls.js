'use strict';
// ================================================================
// HISTÓRICO XLS — GovEstancorp
// Consulta dados históricos de integracao_xls_status_diario
// com filtro por data e visualização de status gov + apto.
// ================================================================

let _histDados      = [];
let _histHotelId    = null;
let _histDataSel    = null;
let _histOrdem      = { col: 'apto', asc: true };
let _histFiltroApto = '';

// ── LABELS E BADGES ────────────────────────────────────────────

const _HIST_STATUS_GOV = {
  vago:        { label: 'Vago',          badge: 'badge-vago'        },
  ocupado:     { label: 'Ocupado',       badge: 'badge-ocupado'     },
  sujo:        { label: 'Sujo',          badge: 'badge-sujo'        },
  limpando:    { label: 'Limpando',      badge: 'badge-limpando'    },
  pausado:     { label: 'Pausado',       badge: 'badge-pausado'     },
  conferencia: { label: 'Conferência',   badge: 'badge-conferencia' },
  limpo:       { label: 'Limpo',         badge: 'badge-limpo'       },
  reprovado:   { label: 'Reprovado',     badge: 'badge-reprovado'   },
  bloqueado:   { label: 'Bloqueado',     badge: 'badge-bloqueado'   },
  manutencao:  { label: 'Manutenção',    badge: 'badge-manutencao'  },
  inspecao:    { label: 'Inspeção',      badge: 'badge-conferencia' },
  nao_perturbe:       { label: 'Não Perturbe',    badge: 'badge-pausado'  },
  nao_quis_arrumacao: { label: 'Não Quis Arr.',   badge: 'badge-pausado'  },
  reservado:   { label: 'Reservado',     badge: 'badge-limpando'    },
  site:        { label: 'Site',          badge: 'badge-limpando'    },
};

const _HIST_STATUS_APTO = {
  vago:     { label: 'Vago',     badge: 'badge-vago'     },
  ocupado:  { label: 'Ocupado',  badge: 'badge-ocupado'  },
  bloqueado:{ label: 'Bloqueado',badge: 'badge-bloqueado'},
  nao_perturbe: { label: 'Não Perturbe', badge: 'badge-pausado' },
  nao_quis_arrumacao: { label: 'Não Quis Arr.', badge: 'badge-pausado' },
};

function _histBadgeGov(val) {
  const v = (val || '').toLowerCase();
  const cfg = _HIST_STATUS_GOV[v];
  if (!cfg) return val ? `<span class="badge badge-outline">${val}</span>` : '<span style="color:var(--text3)">—</span>';
  return `<span class="badge ${cfg.badge}">${cfg.label}</span>`;
}

function _histBadgeApto(val) {
  const v = (val || '').toLowerCase();
  const cfg = _HIST_STATUS_APTO[v];
  if (!cfg) return val ? `<span class="badge badge-outline">${val}</span>` : '<span style="color:var(--text3)">—</span>';
  return `<span class="badge ${cfg.badge}">${cfg.label}</span>`;
}

// ── ENTRY POINT ────────────────────────────────────────────────

async function renderHistoricoXls() {
  const page = document.getElementById('hist-conteudo');
  if (!page) return;

  // Admin global: mostra seletor de hotel
  if (currentUser.perfil === 'admin_global') {
    await _histPopularSeletorHotel();
  } else {
    _histHotelId = currentUser.hotelId;
    const chip = document.getElementById('hist-hotel-chip');
    if (chip) {
      chip.style.display = '';
      chip.innerHTML = `<div style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;
        background:var(--surface2);border-radius:var(--radius-sm);margin-bottom:10px;font-size:12px;color:var(--text2);">
        🏨 <strong style="color:var(--primary);">${currentUser.hotelNome || '—'}</strong>
      </div>`;
    }
  }

  await _histCarregarDatasDisponiveis();
}

// ── SELETOR DE HOTEL (admin_global) ───────────────────────────

async function _histPopularSeletorHotel() {
  const wrap = document.getElementById('hist-hotel-selector');
  if (!wrap) return;
  wrap.style.display = '';

  const { data, error } = await supabaseClient
    .from('hotels').select('id, nome').eq('ativo', true).order('nome');
  if (error || !data?.length) return;

  if (!_histHotelId) _histHotelId = data[0].id;

  wrap.innerHTML = `
    <div class="card" style="padding:12px 16px;border-left:4px solid var(--primary);margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span style="font-size:13px;font-weight:700;color:var(--text2);white-space:nowrap;">🏨 Hotel:</span>
        <select id="hist-hotel-select" onchange="_histOnHotelChange(this.value)"
          style="flex:1;min-width:200px;padding:7px 10px;border:2px solid var(--primary);border-radius:var(--radius-sm);
                 font-size:13px;font-weight:600;color:var(--text);background:var(--surface);">
          ${data.map(h => `<option value="${h.id}" ${h.id === _histHotelId ? 'selected' : ''}>${h.nome}</option>`).join('')}
        </select>
      </div>
    </div>`;

  await _histCarregarDatasDisponiveis();
}

async function _histOnHotelChange(hotelId) {
  _histHotelId = hotelId;
  _histDataSel = null;
  _histDados   = [];
  await _histCarregarDatasDisponiveis();
}

// ── DATAS DISPONÍVEIS ──────────────────────────────────────────

async function _histCarregarDatasDisponiveis() {
  const wrap = document.getElementById('hist-conteudo');
  if (!wrap) return;

  wrap.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px;">
    Carregando datas disponíveis…</div>`;

  const { data, error } = await supabaseClient
    .from('integracao_xls_status_diario')
    .select('data_integracao, modo')
    .eq('hotel_id', _histHotelId)
    .order('data_integracao', { ascending: false });

  if (error) {
    wrap.innerHTML = `<div style="text-align:center;padding:24px;color:var(--danger);">
      Erro ao carregar datas: ${error.message}</div>`;
    return;
  }

  // Agrupar por data
  const porData = {};
  (data || []).forEach(r => {
    if (!porData[r.data_integracao]) porData[r.data_integracao] = new Set();
    porData[r.data_integracao].add(r.modo || 'geral');
  });

  const datas = Object.keys(porData).sort().reverse();

  if (!datas.length) {
    wrap.innerHTML = `<div class="card" style="text-align:center;padding:40px;color:var(--text3);">
      <div style="font-size:32px;margin-bottom:12px;">📅</div>
      <div style="font-size:15px;font-weight:600;">Nenhuma integração encontrada</div>
      <div style="font-size:13px;margin-top:6px;">Realize uma integração XLS para ver o histórico aqui.</div>
    </div>`;
    return;
  }

  // Seleciona a data mais recente por padrão
  if (!_histDataSel || !porData[_histDataSel]) {
    _histDataSel = datas[0];
  }

  _histRenderFiltros(datas, porData);
  await _histCarregarDados();
}

// ── PAINEL DE FILTROS ──────────────────────────────────────────

function _histRenderFiltros(datas, porData) {
  const wrap = document.getElementById('hist-conteudo');
  if (!wrap) return;

  const opts = datas.map(d => {
    const modos = [...porData[d]].join(', ');
    const label = _histFmtData(d);
    return `<option value="${d}" ${d === _histDataSel ? 'selected' : ''}>${label} — ${modos}</option>`;
  }).join('');

  wrap.innerHTML = `
    <!-- Filtros -->
    <div class="card" style="padding:14px 16px;margin-bottom:14px;">
      <div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;">

        <div style="flex:1;min-width:200px;">
          <label style="font-size:11px;font-weight:700;color:var(--text2);display:block;margin-bottom:4px;">
            📅 DATA DA INTEGRAÇÃO
          </label>
          <select id="hist-data-sel" onchange="_histOnDataChange(this.value)"
            style="width:100%;padding:8px 10px;border:2px solid var(--border);border-radius:var(--radius-sm);
                   font-size:13px;color:var(--text);background:var(--surface);">
            ${opts}
          </select>
        </div>

        <div style="flex:1;min-width:160px;">
          <label style="font-size:11px;font-weight:700;color:var(--text2);display:block;margin-bottom:4px;">
            🔍 FILTRAR APTO
          </label>
          <input id="hist-filtro-apto" type="text" placeholder="Ex: 101, 204…"
            value="${_histFiltroApto}"
            oninput="_histFiltroApto=this.value.trim();_histRenderTabela()"
            style="width:100%;padding:8px 10px;border:2px solid var(--border);border-radius:var(--radius-sm);
                   font-size:13px;color:var(--text);background:var(--surface);box-sizing:border-box;">
        </div>

        <button onclick="_histExportarCsv()"
          style="padding:8px 16px;background:var(--surface2);border:2px solid var(--border);
                 border-radius:var(--radius-sm);font-size:12px;font-weight:700;color:var(--text2);
                 cursor:pointer;white-space:nowrap;height:38px;">
          ⬇️ Exportar CSV
        </button>
      </div>
    </div>

    <!-- Resumo -->
    <div id="hist-resumo" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;"></div>

    <!-- Tabela -->
    <div id="hist-tabela"></div>
  `;
}

async function _histOnDataChange(data) {
  _histDataSel = data;
  _histDados   = [];
  await _histCarregarDados();
}

// ── CARGA DE DADOS ─────────────────────────────────────────────

async function _histCarregarDados() {
  const tbl = document.getElementById('hist-tabela');
  const res = document.getElementById('hist-resumo');
  if (tbl) tbl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px;">
    Carregando dados…</div>`;
  if (res) res.innerHTML = '';

  const { data, error } = await supabaseClient
    .from('integracao_xls_status_diario')
    .select('apto,status_apto,status_apto_original,status_governanca,status_governanca_original,adultos,criancas,data_partida,modo,arquivo_nome,created_at')
    .eq('hotel_id', _histHotelId)
    .eq('data_integracao', _histDataSel)
    .order('apto', { ascending: true });

  if (error) {
    if (tbl) tbl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--danger);">
      Erro: ${error.message}</div>`;
    return;
  }

  _histDados = data || [];
  _histRenderResumo();
  _histRenderTabela();
}

// ── RESUMO (CARDS) ─────────────────────────────────────────────

function _histRenderResumo() {
  const res = document.getElementById('hist-resumo');
  if (!res || !_histDados.length) return;

  const contar = (campo, valor) => _histDados.filter(r => (r[campo] || '').toLowerCase() === valor).length;

  const totalAptos = _histDados.length;
  const ocupados   = contar('status_apto', 'ocupado') + contar('status_apto', 'nao_perturbe') + contar('status_apto', 'nao_quis_arrumacao');
  const vagos      = contar('status_apto', 'vago');
  const bloqueados = contar('status_apto', 'bloqueado');
  const sujos      = contar('status_governanca', 'sujo');
  const limpos     = contar('status_governanca', 'limpo') + contar('status_governanca', 'vago');
  const manut      = contar('status_governanca', 'manutencao');

  const arquivo = _histDados[0]?.arquivo_nome || '';
  const modo    = _histDados[0]?.modo || 'geral';
  const dtHora  = _histDados[0]?.created_at
    ? new Date(_histDados[0].created_at).toLocaleString('pt-BR', { day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit' })
    : '';

  const card = (icon, label, valor, cor) =>
    `<div class="card" style="padding:12px 16px;min-width:100px;flex:1;border-top:3px solid ${cor};">
       <div style="font-size:20px;">${icon}</div>
       <div style="font-size:22px;font-weight:800;color:${cor};line-height:1.1;">${valor}</div>
       <div style="font-size:11px;color:var(--text2);font-weight:600;">${label}</div>
     </div>`;

  res.innerHTML = `
    ${card('🏠', 'Total Aptos',   totalAptos, 'var(--text)'     )}
    ${card('🔴', 'Ocupados',      ocupados,   'var(--danger)'   )}
    ${card('🟢', 'Vagos',         vagos,      'var(--success)'  )}
    ${card('⚫', 'Bloqueados',    bloqueados, 'var(--text3)'    )}
    ${card('🟡', 'Sujos/Limpeza', sujos,      '#f59e0b'         )}
    ${card('✅', 'Limpos',        limpos,     'var(--primary)'  )}
    ${card('🔧', 'Manutenção',    manut,      '#8b5cf6'         )}
    <div class="card" style="padding:12px 16px;flex:1;min-width:160px;border-top:3px solid var(--border);">
      <div style="font-size:11px;color:var(--text2);font-weight:700;margin-bottom:4px;">📂 ARQUIVO</div>
      <div style="font-size:12px;color:var(--text);font-weight:600;word-break:break-all;">${arquivo || '—'}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px;">
        ${modo === 'geral' ? '🔄 Modo Geral' : '📋 Modo Status Apto'} · ${dtHora}
      </div>
    </div>
  `;
}

// ── TABELA PRINCIPAL ───────────────────────────────────────────

function _histRenderTabela() {
  const tbl = document.getElementById('hist-tabela');
  if (!tbl) return;

  // Filtro por apto
  const filtro = _histFiltroApto.toLowerCase();
  let dados = filtro
    ? _histDados.filter(r => (r.apto || '').toLowerCase().includes(filtro))
    : _histDados;

  // Ordenação
  dados = [...dados].sort((a, b) => {
    const col = _histOrdem.col;
    const va  = (a[col] ?? '').toString().toLowerCase();
    const vb  = (b[col] ?? '').toString().toLowerCase();
    const cmp = col === 'apto' ? _histCmpApto(a.apto, b.apto) : va.localeCompare(vb, 'pt-BR');
    return _histOrdem.asc ? cmp : -cmp;
  });

  if (!dados.length) {
    tbl.innerHTML = `<div class="card" style="text-align:center;padding:32px;color:var(--text3);">
      <div style="font-size:24px;margin-bottom:8px;">🔍</div>
      <div>Nenhum apartamento encontrado.</div>
    </div>`;
    return;
  }

  const thStyle = `padding:9px 12px;text-align:left;font-size:11px;font-weight:800;
    color:var(--text2);text-transform:uppercase;letter-spacing:.5px;
    cursor:pointer;user-select:none;white-space:nowrap;`;

  const arrow = (col) => {
    if (_histOrdem.col !== col) return '<span style="color:var(--border);margin-left:4px;">↕</span>';
    return _histOrdem.asc
      ? '<span style="color:var(--primary);margin-left:4px;">↑</span>'
      : '<span style="color:var(--primary);margin-left:4px;">↓</span>';
  };

  const th = (col, label) =>
    `<th style="${thStyle}" onclick="_histSortBy('${col}')">${label}${arrow(col)}</th>`;

  const linhas = dados.map(r => {
    const partida = r.data_partida
      ? new Date(r.data_partida + 'T12:00:00').toLocaleDateString('pt-BR', { day:'2-digit',month:'2-digit' })
      : '<span style="color:var(--text3)">—</span>';

    const pax = r.adultos || 0;
    const cri = r.criancas || 0;
    const paxCell = pax > 0
      ? `${pax} adulto${pax > 1 ? 's' : ''}${cri > 0 ? ` + ${cri} criança${cri > 1 ? 's' : ''}` : ''}`
      : '<span style="color:var(--text3)">—</span>';

    return `<tr>
      <td style="padding:9px 12px;font-weight:700;font-size:13px;">${r.apto}</td>
      <td style="padding:9px 12px;">${_histBadgeApto(r.status_apto)}</td>
      <td style="padding:9px 12px;font-size:11px;color:var(--text3);">${r.status_apto_original || '—'}</td>
      <td style="padding:9px 12px;">${_histBadgeGov(r.status_governanca)}</td>
      <td style="padding:9px 12px;font-size:11px;color:var(--text3);">${r.status_governanca_original || '—'}</td>
      <td style="padding:9px 12px;font-size:13px;">${paxCell}</td>
      <td style="padding:9px 12px;font-size:13px;">${partida}</td>
    </tr>`;
  }).join('');

  tbl.innerHTML = `
    <div class="card" style="padding:0;overflow:hidden;">
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead style="background:var(--surface2);border-bottom:2px solid var(--border);">
            <tr>
              ${th('apto',               'Apto')}
              ${th('status_apto',        'Status Apto')}
              <th style="${thStyle};cursor:default;">Original GOV</th>
              ${th('status_governanca',  'Status Gov')}
              <th style="${thStyle};cursor:default;">Original GOV</th>
              ${th('adultos',            'Pax')}
              ${th('data_partida',       'Partida')}
            </tr>
          </thead>
          <tbody>
            ${linhas}
          </tbody>
        </table>
      </div>
      <div style="padding:10px 14px;font-size:12px;color:var(--text3);border-top:1px solid var(--border);">
        ${dados.length} de ${_histDados.length} apartamentos · data: ${_histFmtData(_histDataSel)}
      </div>
    </div>
  `;
}

// ── ORDENAÇÃO ──────────────────────────────────────────────────

function _histSortBy(col) {
  if (_histOrdem.col === col) {
    _histOrdem.asc = !_histOrdem.asc;
  } else {
    _histOrdem = { col, asc: true };
  }
  _histRenderTabela();
}

// Ordenação natural para número de apto (101 < 204 < 1001)
function _histCmpApto(a, b) {
  const na = parseInt(a, 10), nb = parseInt(b, 10);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return (a || '').localeCompare(b || '', 'pt-BR');
}

// ── EXPORTAR CSV ───────────────────────────────────────────────

function _histExportarCsv() {
  if (!_histDados.length) { toast('Nenhum dado para exportar', 'warning'); return; }

  const filtro = _histFiltroApto.toLowerCase();
  const dados  = filtro ? _histDados.filter(r => (r.apto || '').toLowerCase().includes(filtro)) : _histDados;

  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const header = ['Apto','Status Apto','Status Apto Original','Status Gov','Status Gov Original','Adultos','Crianças','Partida','Modo'];
  const linhas = dados.map(r => [
    r.apto,
    r.status_apto              || '',
    r.status_apto_original     || '',
    r.status_governanca        || '',
    r.status_governanca_original || '',
    r.adultos                  || 0,
    r.criancas                 || 0,
    r.data_partida             || '',
    r.modo                     || '',
  ].map(esc).join(';'));

  const csv = [header.map(esc).join(';'), ...linhas].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `historico-xls_${_histDataSel}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV exportado com sucesso', 'success');
}

// ── UTILIDADES ─────────────────────────────────────────────────

function _histFmtData(d) {
  if (!d) return '—';
  const [y, m, dia] = d.split('-');
  return `${dia}/${m}/${y}`;
}
