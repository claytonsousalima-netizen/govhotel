'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// MAPEAMENTOS DE STATUS
// Valor interno mantido (limpando, sujo, etc.) — apenas label exibida muda
// ══════════════════════════════════════════════════════════════════════════════

// STATUS APTO do XLS → { interno, label }
const _MAP_STATUS_APTO = {
  'LIMPO':         { interno: 'limpo',      label: 'Limpo'              },
  'SUJO':          { interno: 'sujo',       label: 'Sujo'               },
  'Inspecao':      { interno: 'inspecao',   label: 'Inspeção'           },
  'Inspeção':      { interno: 'inspecao',   label: 'Inspeção'           },
  'Arrumacao':     { interno: 'limpando',   label: 'Arrumando'          },
  'Arrumação':     { interno: 'limpando',   label: 'Arrumando'          },
  'Manutencao':    { interno: 'manutencao', label: 'Manutenção'         },
  'Manutenção':    { interno: 'manutencao', label: 'Manutenção'         },
  'Reservado':     { interno: 'limpo',      label: 'Limpo'              },
  'Nao Perturbe':  { interno: 'nao_perturbe',       label: 'Não Perturbe'       },
  'Não Perturbe':  { interno: 'nao_perturbe',       label: 'Não Perturbe'       },
  'N.Q.A.':        { interno: 'nao_quis_arrumacao', label: 'Não quis arrumação' },
};

// STATUS GOV do XLS → { interno, label }
const _MAP_STATUS_GOV = {
  'VAGO':          { interno: 'vago',              label: 'Vago'                },
  'OCUPADO':       { interno: 'ocupado',            label: 'Ocupado'             },
  'BLOQUEADO':     { interno: 'bloqueado',          label: 'Bloqueado'           },
  'Nao Perturbe':  { interno: 'nao_perturbe',       label: 'Não Perturbe'        },
  'Não Perturbe':  { interno: 'nao_perturbe',       label: 'Não Perturbe'        },
  'N.Q.A.':        { interno: 'nao_quis_arrumacao', label: 'Não quis arrumação'  },
};

// ══════════════════════════════════════════════════════════════════════════════
// ESTADO DO MÓDULO
// ══════════════════════════════════════════════════════════════════════════════

let _xlsRegistrosValidos  = [];   // registros prontos após parse+validação
let _xlsIgnoradas         = 0;
let _xlsInconsistencias   = [];   // conflitos de duplicata (excluídos do import)
let _xlsNaoReconhecidos   = [];   // status inválido mas importados parcialmente

// ══════════════════════════════════════════════════════════════════════════════
// FUNÇÕES DE NORMALIZAÇÃO (Etapa 4)
// ══════════════════════════════════════════════════════════════════════════════

function normalizarNumeroApto(valor) {
  const s = String(valor ?? '').trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  if (isNaN(n) || n <= 0) return null;
  return String(n);
}

function normalizarStatusApto(valor) {
  const s = String(valor ?? '').trim();
  return _MAP_STATUS_APTO[s] || null;
}

function normalizarStatusGovernanca(valor) {
  const s = String(valor ?? '').trim();
  return _MAP_STATUS_GOV[s] || null;
}

function normalizarAdultos(valor) {
  if (valor === '' || valor === null || valor === undefined) return 0;
  const n = parseInt(String(valor).trim(), 10);
  return isNaN(n) ? 0 : Math.max(0, n);
}

function normalizarDataPartida(valor) {
  if (!valor && valor !== 0) return null;
  // Número serial do Excel → Date
  if (typeof valor === 'number') {
    const d = new Date(Math.round((valor - 25569) * 86400 * 1000));
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const s = String(valor).trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function filtrarLinhaValidaIntegracao(row) {
  // Linha vazia
  if (!row || row.every(c => c === '' || c === null || c === undefined)) return false;
  // Cabeçalho repetido no meio da planilha
  const col0 = String(row[0] ?? '').trim().toUpperCase();
  if (col0 === 'CODUH') return false;
  // Rodapé ou texto livre (coluna A não é número de apto)
  return normalizarNumeroApto(row[0]) !== null;
}

// ══════════════════════════════════════════════════════════════════════════════
// VALIDAÇÃO DE CABEÇALHOS
// ══════════════════════════════════════════════════════════════════════════════

function validarCabecalhosIntegracaoXls(rows) {
  // Linha 5 da planilha = índice 4 no array (range:0 do SheetJS)
  // Mas como usamos range:4 no parse, rows[0] = linha 5 da planilha
  // Portanto a linha de cabeçalhos é rows[0]
  const header = rows[0] || [];
  const erros  = [];
  const esperados = { 0: 'CODUH', 3: 'STATUS APTO', 6: 'STATUS GOV', 9: 'ADULTOS', 12: 'PARTIDA' };
  for (const [idx, nome] of Object.entries(esperados)) {
    const val = String(header[idx] ?? '').trim().toUpperCase();
    if (!val.includes(nome.toUpperCase())) {
      erros.push(`Coluna ${String.fromCharCode(65 + parseInt(idx))} esperada: "${nome}", encontrada: "${header[idx] ?? '(vazia)'}"`);
    }
  }
  return { ok: erros.length === 0, erros, abaSugerida: false };
}

// ══════════════════════════════════════════════════════════════════════════════
// DETECÇÃO DE DUPLICIDADES
// ══════════════════════════════════════════════════════════════════════════════

function detectarDuplicidadesIntegracao(registros) {
  const mapa   = {};
  const finais = [];
  const conflitos = [];

  registros.forEach(r => {
    const key = r.numero;
    if (!mapa[key]) {
      mapa[key] = r;
      finais.push(r);
    } else {
      const anterior = mapa[key];
      const igual = (anterior.saOriginal === r.saOriginal &&
                     anterior.sgOriginal === r.sgOriginal &&
                     anterior.adultos    === r.adultos    &&
                     anterior.dataPartida === r.dataPartida);
      if (!igual) {
        conflitos.push({ apto: key, linha1: anterior, linha2: r });
        // Marca o registro já inserido como conflito
        anterior.conflito = true;
        r.conflito = true;
        finais.push(r);  // inclui ambos para exibição
      }
      // Se idênticos, ignora duplicata silenciosa
    }
  });

  return { finais, conflitos };
}

// ══════════════════════════════════════════════════════════════════════════════
// RESUMO
// ══════════════════════════════════════════════════════════════════════════════

function montarResumoIntegracao(registros, ignoradas, inconsistencias) {
  const validos    = registros.filter(r => !r.conflito);
  const ocupados   = registros.filter(r => r.statusGov?.interno === 'ocupado').length;
  const vagos      = registros.filter(r => r.statusGov?.interno === 'vago').length;
  const bloqueados = registros.filter(r => r.statusGov?.interno === 'bloqueado').length;
  const comAdultos = registros.filter(r => (r.adultos || 0) > 0).length;
  return {
    totalLidas:          registros.length + ignoradas,
    totalValidos:        validos.length,
    totalIgnoradas:      ignoradas,
    totalOcupados:       ocupados,
    totalVagos:          vagos,
    totalBloqueados:     bloqueados,
    totalComAdultos:     comAdultos,
    totalInconsistencias: inconsistencias.length,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// PARSER PRINCIPAL (Etapa 4)
// ══════════════════════════════════════════════════════════════════════════════

async function parseIntegracaoXlsFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary', cellDates: false });

        // Prefere aba "Report"; caso não exista, usa a primeira
        let sheetName = wb.SheetNames.find(n => n.trim().toLowerCase() === 'report');
        let abaAviso  = null;
        if (!sheetName) {
          sheetName = wb.SheetNames[0];
          abaAviso  = `Aba "Report" não encontrada. Usando a primeira aba: "${sheetName}"`;
        }

        const sh = wb.Sheets[sheetName];
        // range:4 = começa na linha 5 (índice 4, 0-based), que é a linha de cabeçalhos
        const rows = XLSX.utils.sheet_to_json(sh, { header: 1, range: 4, defval: '' });

        // Valida cabeçalhos (rows[0] = linha 5 da planilha)
        const cabValido = validarCabecalhosIntegracaoXls(rows);

        // Dados começam a partir de rows[1] (linha 6 da planilha)
        const linhasDados = rows.slice(1);

        let ignoradas  = 0;
        const registros = [];

        linhasDados.forEach(row => {
          if (!filtrarLinhaValidaIntegracao(row)) { ignoradas++; return; }

          const numero      = normalizarNumeroApto(row[0]);
          const saOriginal  = String(row[3]  ?? '').trim();
          const sgOriginal  = String(row[6]  ?? '').trim();
          const statusApto  = normalizarStatusApto(saOriginal);
          const statusGov   = normalizarStatusGovernanca(sgOriginal);
          const adultos     = normalizarAdultos(row[9]);
          const dataPartida = normalizarDataPartida(row[12]);

          // Status não reconhecido é inconsistência, mas não bloqueia
          const incApto = !statusApto  && saOriginal ? `Status apto não reconhecido: "${saOriginal}"` : null;
          const incGov  = !statusGov   && sgOriginal ? `Status gov não reconhecido: "${sgOriginal}"`  : null;

          registros.push({
            numero,
            saOriginal,
            sgOriginal,
            statusApto,
            statusGov,
            adultos,
            dataPartida,
            conflito:      false,
            incApto,
            incGov,
          });
        });

        // Detecta duplicidades
        const { finais, conflitos } = detectarDuplicidadesIntegracao(registros);

        resolve({ rows: finais, ignoradas, conflitos, cabValido, abaAviso });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.readAsBinaryString(file);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDER PREVIEW (Etapa 4)
// ══════════════════════════════════════════════════════════════════════════════

function renderPreviewIntegracaoXls(registros) {
  const tbody = document.getElementById('xls-preview-body');
  if (!tbody) return;

  tbody.innerHTML = registros.map(r => {
    let situacao = '✅ OK';
    let rowStyle = '';

    if (r.conflito) {
      situacao = '⚠️ Conflito';
      rowStyle = 'background:#fef9c3;';
    } else if (r.incApto || r.incGov) {
      situacao = '⚠️ Status não reconhecido';
      rowStyle = 'background:#fff7ed;';
    }

    const saLabel = r.statusApto
      ? `<span style="color:#166534;font-weight:600;">${r.statusApto.label}</span>`
      : `<span style="color:#b45309;">⚠️ ${r.incApto || 'não mapeado'}</span>`;

    const sgLabel = r.statusGov
      ? `<span style="color:#1e40af;font-weight:600;">${r.statusGov.label}</span>`
      : `<span style="color:#b45309;">⚠️ ${r.incGov || 'não mapeado'}</span>`;

    return `<tr style="${rowStyle}">
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-weight:600;">${r.numero}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;color:#6b7280;">${r.saOriginal || '—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;">${saLabel}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;color:#6b7280;">${r.sgOriginal || '—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;">${sgLabel}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:center;">${r.adultos ?? 0}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;">${r.dataPartida || '—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;">${situacao}</td>
    </tr>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// RENDER DA TELA (Etapa 3B)
// ══════════════════════════════════════════════════════════════════════════════

function renderIntegracaoXls() {
  _xlsRegistrosValidos = [];
  _xlsIgnoradas        = 0;
  _xlsInconsistencias  = [];
  _xlsNaoReconhecidos  = [];

  const hotelNome  = currentUser?.hotelNome || '';
  const hotelId    = currentUser?.hotelId   || '';
  const hoje       = new Date().toISOString().slice(0, 10);
  const isAdmGlobal = currentUser?.perfil === 'admin_global';

  const el = document.getElementById('page-integracao-xls');
  if (!el) return;

  el.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Integração XLS</div>
        <div class="page-subtitle">Importação diária do status dos apartamentos</div>
      </div>
    </div>

    <div style="max-width:960px;margin:0 auto;padding:0 0 40px;">

      <!-- Card de configuração -->
      <div class="card" style="padding:24px;margin-bottom:20px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:end;flex-wrap:wrap;">

          <!-- Hotel -->
          <div>
            <label style="display:block;font-size:12px;font-weight:600;color:#6b7280;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">Hotel</label>
            ${isAdmGlobal
              ? `<select id="xls-hotel-select"
                   style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;background:var(--surface);"
                   onchange="_xlsOnHotelChange()">
                   <option value="">Selecione o hotel...</option>
                 </select>`
              : `<div style="padding:10px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-weight:500;">
                   ${hotelNome}
                   <input type="hidden" id="xls-hotel-id" value="${hotelId}">
                 </div>`
            }
          </div>

          <!-- Data da integração -->
          <div>
            <label style="display:block;font-size:12px;font-weight:600;color:#6b7280;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">Data da integração</label>
            <input type="date" id="xls-data"
              style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;background:var(--surface);"
              value="${hoje}">
          </div>
        </div>
      </div>

      <!-- Card de upload -->
      <div class="card" style="padding:24px;margin-bottom:20px;">
        <div style="font-weight:600;margin-bottom:4px;">Arquivo de status (exportado pelo GOV)</div>
        <div style="font-size:12px;color:#9ca3af;margin-bottom:16px;">
          Formatos aceitos: <strong>.xls</strong> e <strong>.xlsx</strong> &nbsp;·&nbsp;
          Aba: <code>Report</code> &nbsp;·&nbsp;
          Cabeçalhos na linha 5 &nbsp;·&nbsp; Dados a partir da linha 6
        </div>

        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <label class="btn btn-outline" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
            📂 Selecionar arquivo
            <input type="file" id="xls-file-input" accept=".xls,.xlsx"
                   style="display:none;" onchange="_xlsOnFileSelected(this)">
          </label>
          <span id="xls-file-name" style="color:#6b7280;font-size:13px;">Nenhum arquivo selecionado</span>
        </div>

        <div style="margin-top:16px;">
          <button class="btn btn-primary" id="xls-btn-validar" disabled onclick="_xlsValidar()">
            🔍 Validar arquivo
          </button>
        </div>
      </div>

      <!-- Área de avisos -->
      <div id="xls-avisos" style="display:none;margin-bottom:20px;"></div>

      <!-- Resumo da validação -->
      <div id="xls-resumo" style="display:none;margin-bottom:20px;">
        <div class="card" style="padding:24px;">
          <div style="font-weight:600;margin-bottom:16px;">Resumo da validação</div>
          <div id="xls-resumo-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;"></div>
        </div>
      </div>

      <!-- Tabela de prévia -->
      <div id="xls-preview-wrap" style="display:none;margin-bottom:20px;">
        <div class="card" style="padding:24px;">
          <div style="font-weight:600;margin-bottom:16px;">Prévia dos dados</div>
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="background:#f3f4f6;text-align:left;">
                  <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">Apto</th>
                  <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">Status Apto XLS</th>
                  <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">Status Apto Sistema</th>
                  <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">Status Gov XLS</th>
                  <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">Status Gov Sistema</th>
                  <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:center;">Adultos</th>
                  <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">Partida</th>
                  <th style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">Situação</th>
                </tr>
              </thead>
              <tbody id="xls-preview-body"></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Ação final -->
      <div style="display:flex;justify-content:flex-end;gap:12px;flex-wrap:wrap;">
        <button class="btn btn-outline" onclick="_xlsReset()">🔄 Limpar</button>
        <button class="btn btn-primary" id="xls-btn-confirmar" disabled onclick="_xlsConfirmar(false)">
          ✅ Confirmar integração
        </button>
      </div>

    </div>
  `;

  // Se admin_global, carrega hotéis
  if (isAdmGlobal) _xlsCarregarHoteis();
}

// ══════════════════════════════════════════════════════════════════════════════
// HANDLERS DE INTERAÇÃO
// ══════════════════════════════════════════════════════════════════════════════

async function _xlsCarregarHoteis() {
  const sel = document.getElementById('xls-hotel-select');
  if (!sel) return;
  const { data } = await supabaseClient.from('hotels').select('id, nome').order('nome');
  (data || []).forEach(h => {
    const opt = document.createElement('option');
    opt.value = h.id;
    opt.textContent = h.nome;
    sel.appendChild(opt);
  });
}

function _xlsOnHotelChange() {
  // Reset ao trocar hotel
  _xlsReset();
}

function _xlsGetHotelId() {
  const sel = document.getElementById('xls-hotel-select');
  if (sel) return sel.value || null;
  const inp = document.getElementById('xls-hotel-id');
  return inp ? inp.value || null : (currentUser?.hotelId || null);
}

function _xlsOnFileSelected(input) {
  const file = input.files[0];
  const nomEl = document.getElementById('xls-file-name');
  const btnVal = document.getElementById('xls-btn-validar');

  if (!file) {
    nomEl.textContent = 'Nenhum arquivo selecionado';
    btnVal.disabled   = true;
    return;
  }

  nomEl.textContent = file.name;
  btnVal.disabled   = false;

  // Limpa resultados anteriores
  _xlsLimparResultados();
}

function _xlsLimparResultados() {
  _xlsRegistrosValidos = [];
  _xlsIgnoradas        = 0;
  _xlsInconsistencias  = [];
  _xlsNaoReconhecidos  = [];

  const resumo  = document.getElementById('xls-resumo');
  const preview = document.getElementById('xls-preview-wrap');
  const avisos  = document.getElementById('xls-avisos');
  const btnConf = document.getElementById('xls-btn-confirmar');

  if (resumo)  resumo.style.display  = 'none';
  if (preview) preview.style.display = 'none';
  if (avisos)  avisos.style.display  = 'none';
  if (btnConf) btnConf.disabled      = true;
}

async function _xlsValidar() {
  const input   = document.getElementById('xls-file-input');
  const btnVal  = document.getElementById('xls-btn-validar');
  const avisos  = document.getElementById('xls-avisos');
  const hotelId = _xlsGetHotelId();

  if (!hotelId) {
    toast('Selecione o hotel antes de validar.', 'error');
    return;
  }

  const file = input?.files[0];
  if (!file) { toast('Selecione um arquivo.', 'error'); return; }

  btnVal.disabled   = true;
  btnVal.textContent = '⏳ Validando...';
  _xlsLimparResultados();

  try {
    const { rows, ignoradas, conflitos, cabValido, abaAviso } = await parseIntegracaoXlsFile(file);

    // Linhas com status não reconhecido (importadas parcialmente)
    const naoReconhecidos = rows.filter(r => !r.conflito && (r.incApto || r.incGov));

    // Exibe avisos
    const avisosList = [];
    if (abaAviso)              avisosList.push({ tipo:'warn', msg: abaAviso });
    if (!cabValido.ok)         cabValido.erros.forEach(e => avisosList.push({ tipo:'error', msg: e }));
    if (conflitos.length)      avisosList.push({ tipo:'warn', msg: `${conflitos.length} apartamento(s) aparecem com dados conflitantes e foram destacados.` });
    if (naoReconhecidos.length) avisosList.push({ tipo:'warn', msg: `${naoReconhecidos.length} apartamento(s) com status não reconhecido — importados com status parcial.` });

    if (avisosList.length) {
      avisos.innerHTML = avisosList.map(a => `
        <div style="padding:10px 16px;border-radius:8px;margin-bottom:8px;font-size:13px;
          background:${a.tipo==='error'?'#fee2e2':'#fef9c3'};
          border:1px solid ${a.tipo==='error'?'#fca5a5':'#fde68a'};
          color:${a.tipo==='error'?'#991b1b':'#92400e'};">
          ${a.tipo==='error'?'❌':'⚠️'} ${a.msg}
        </div>`).join('');
      avisos.style.display = '';
    }

    // Resumo — inconsistências = conflitos duplicados + status não reconhecidos
    const resumo = montarResumoIntegracao(rows, ignoradas, [...conflitos, ...naoReconhecidos]);
    _xlsRenderResumo(resumo);

    // Preview
    renderPreviewIntegracaoXls(rows);
    document.getElementById('xls-preview-wrap').style.display = '';

    // Guarda estado
    _xlsRegistrosValidos  = rows.filter(r => !r.conflito && (r.statusApto || r.statusGov));
    _xlsIgnoradas         = ignoradas;
    _xlsInconsistencias   = conflitos;          // conflitos duplicados (excluídos do import)
    _xlsNaoReconhecidos   = naoReconhecidos;    // status inválido (importados parcialmente)

    // Habilita confirmar somente se há registros válidos
    const btnConf = document.getElementById('xls-btn-confirmar');
    if (btnConf) btnConf.disabled = _xlsRegistrosValidos.length === 0;

  } catch (err) {
    toast('Erro ao processar arquivo: ' + err.message, 'error');
    console.error('parseIntegracaoXlsFile:', err);
  } finally {
    btnVal.disabled   = false;
    btnVal.textContent = '🔍 Validar arquivo';
  }
}

function _xlsRenderResumo(r) {
  const items = [
    { label:'Linhas lidas',         val: r.totalLidas,          cor:'#6b7280' },
    { label:'Aptos válidos',         val: r.totalValidos,        cor:'#16a34a' },
    { label:'Linhas ignoradas',      val: r.totalIgnoradas,      cor:'#9ca3af' },
    { label:'Ocupados',              val: r.totalOcupados,       cor:'#ef4444' },
    { label:'Vagos',                 val: r.totalVagos,          cor:'#22c55e' },
    { label:'Bloqueados',            val: r.totalBloqueados,     cor:'#6b7280' },
    { label:'Com adultos',           val: r.totalComAdultos,     cor:'#3b82f6' },
    { label:'Inconsistências',       val: r.totalInconsistencias,cor: r.totalInconsistencias > 0 ? '#f59e0b' : '#9ca3af' },
  ];

  document.getElementById('xls-resumo-grid').innerHTML = items.map(i => `
    <div style="padding:14px 16px;border-radius:10px;background:#f9fafb;border:1px solid #e5e7eb;text-align:center;">
      <div style="font-size:24px;font-weight:800;color:${i.cor};line-height:1.2;">${i.val}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px;font-weight:500;">${i.label}</div>
    </div>
  `).join('');

  document.getElementById('xls-resumo').style.display = '';
}

function _xlsReset() {
  _xlsRegistrosValidos = [];
  _xlsIgnoradas        = 0;
  _xlsInconsistencias  = [];
  _xlsNaoReconhecidos  = [];

  const input = document.getElementById('xls-file-input');
  if (input) input.value = '';
  const nomEl = document.getElementById('xls-file-name');
  if (nomEl) nomEl.textContent = 'Nenhum arquivo selecionado';

  const btnVal = document.getElementById('xls-btn-validar');
  if (btnVal) { btnVal.disabled = true; btnVal.textContent = '🔍 Validar arquivo'; }

  _xlsLimparResultados();
}

// ══════════════════════════════════════════════════════════════════════════════
// ETAPA 5 — GRAVAÇÃO NO SUPABASE VIA RPC
// ══════════════════════════════════════════════════════════════════════════════

async function _xlsConfirmar(substituir = false) {
  // ── Validações de pré-condição ───────────────────────────────────────────
  const hotelId = _xlsGetHotelId();
  if (!hotelId) { toast('Selecione o hotel antes de confirmar.', 'error'); return; }

  const dataEl = document.getElementById('xls-data');
  const dataIntegracao = dataEl?.value?.trim();
  if (!dataIntegracao) { toast('Informe a data da integração.', 'error'); return; }

  const fileInput = document.getElementById('xls-file-input');
  const arquivoNome = fileInput?.files[0]?.name || '';
  if (!arquivoNome) { toast('Nenhum arquivo validado. Valide o arquivo antes de confirmar.', 'error'); return; }

  if (!_xlsRegistrosValidos.length) {
    toast('Nenhum registro válido para importar.', 'error');
    return;
  }

  // ── Monta payload para a RPC ─────────────────────────────────────────────
  const payload = _xlsRegistrosValidos.map(r => ({
    apto:                      r.numero,
    status_apto:               r.statusGov?.interno   || null,   // STATUS GOV → campo status_apto (ocupação)
    status_apto_original:      r.sgOriginal            || null,
    status_governanca:         r.statusApto?.interno   || null,  // STATUS APTO → campo status_governanca (limpeza)
    status_governanca_original: r.saOriginal           || null,
    adultos:                   r.adultos               ?? 0,
    data_partida:              r.dataPartida           || null,
  }));

  const totalLinhas          = _xlsRegistrosValidos.length + _xlsIgnoradas + _xlsInconsistencias.length;
  const totalImportadas      = _xlsRegistrosValidos.length;
  const totalIgnoradas       = _xlsIgnoradas;
  const totalInconsistencias = _xlsInconsistencias.length + _xlsNaoReconhecidos.length;

  // ── UI: bloqueia botão durante gravação ──────────────────────────────────
  const btnConf = document.getElementById('xls-btn-confirmar');
  if (btnConf) { btnConf.disabled = true; btnConf.textContent = '⏳ Salvando...'; }

  try {
    const { data, error } = await supabaseClient.rpc(
      'importar_integracao_xls_status_diario',
      {
        p_hotel_id:               hotelId,
        p_data:                   dataIntegracao,
        p_arquivo_nome:           arquivoNome,
        p_payload:                payload,
        p_total_linhas:           totalLinhas,
        p_total_importadas:       totalImportadas,
        p_total_ignoradas:        totalIgnoradas,
        p_total_inconsistencias:  totalInconsistencias,
        p_substituir:             substituir,
      }
    );

    if (error) {
      console.error('RPC importar_integracao_xls_status_diario:', error);
      toast('Erro ao salvar integração. Tente novamente.', 'error');
      return;
    }

    // ── Trata retornos controlados da RPC ────────────────────────────────
    if (!data?.ok) {
      if (data?.erro === 'ja_existe') {
        _xlsConfirmarSubstituicao(data.mensagem);
        return;
      }
      toast(data?.mensagem || 'Erro ao salvar integração. Tente novamente.', 'error');
      return;
    }

    // ── Sucesso ──────────────────────────────────────────────────────────
    const msgSucesso = substituir
      ? `Integração substituída com sucesso. ${totalImportadas} apartamentos atualizados.`
      : `Arquivo importado com sucesso. ${totalImportadas} apartamentos salvos.`;

    toast(msgSucesso, 'success');

    // Desabilita botão confirmar para evitar dupla gravação
    if (btnConf) { btnConf.disabled = true; btnConf.textContent = '✅ Integração salva'; }

  } catch (err) {
    console.error('_xlsConfirmar:', err);
    toast('Erro ao salvar integração. Tente novamente.', 'error');
  } finally {
    // Só reabilita se ainda não foi salvo com sucesso
    const btnAtual = document.getElementById('xls-btn-confirmar');
    if (btnAtual && btnAtual.textContent !== '✅ Integração salva') {
      btnAtual.disabled   = false;
      btnAtual.textContent = '✅ Confirmar integração';
    }
  }
}

// ── Diálogo de confirmação de substituição ────────────────────────────────────
function _xlsConfirmarSubstituicao(mensagemRpc) {
  // Reutiliza o padrão de modal existente no projeto se disponível,
  // caso contrário usa confirm() nativo como fallback seguro
  const msgExibir = mensagemRpc ||
    'Já existe uma integração para este hotel nesta data. Deseja substituir os dados anteriores?';

  // Tenta usar modal customizado do sistema (openModal/closeModal)
  // Injeta dinamicamente um modal de confirmação simples
  const modalId = 'modal-xls-substituir';
  let modal = document.getElementById(modalId);
  if (!modal) {
    modal = document.createElement('div');
    modal.id        = modalId;
    modal.className = 'modal-overlay';
    modal.dataset.obrigatorio = 'true';
    modal.innerHTML = `
      <div class="modal" style="max-width:460px;">
        <div class="modal-header">
          <div class="modal-title">⚠️ Integração já existe</div>
        </div>
        <div class="modal-body">
          <p id="xls-modal-msg" style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;"></p>
          <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
            <button class="btn btn-outline"
                    onclick="closeModal('${modalId}')">
              Cancelar
            </button>
            <button class="btn btn-danger"
                    onclick="closeModal('${modalId}');_xlsConfirmar(true)">
              Sim, substituir
            </button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  document.getElementById('xls-modal-msg').textContent = msgExibir;
  openModal(modalId);
}
