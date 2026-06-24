'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// MAPEAMENTOS DE STATUS
// Valor interno mantido (limpando, sujo, etc.) — apenas label exibida muda
// ══════════════════════════════════════════════════════════════════════════════

// Col D = STATUS GOV (limpeza/governança): Limpo, Sujo, Arrumação, Inspeção, Manutenção, etc.
const _MAP_COL_D_GOV = {
  'LIMPO':         { interno: 'limpo',              label: 'Limpo'              },
  'SUJO':          { interno: 'sujo',               label: 'Sujo'               },
  'Inspecao':      { interno: 'inspecao',           label: 'Inspeção'           },
  'Inspeção':      { interno: 'inspecao',           label: 'Inspeção'           },
  'Arrumacao':     { interno: 'conferencia',        label: 'Arrumação'          },
  'Arrumação':     { interno: 'conferencia',        label: 'Arrumação'          },
  'Manutencao':    { interno: 'manutencao',         label: 'Manutenção'         },
  'Manutenção':    { interno: 'manutencao',         label: 'Manutenção'         },
  'Reservado':     { interno: 'reservado',          label: 'Reservado'          },
  'Site PPT':      { interno: 'site',               label: 'Site'               },
  'SITE PPT':      { interno: 'site',               label: 'Site'               },
  'Nao Perturbe':  { interno: 'nao_perturbe',       label: 'Não Perturbe'       },
  'Não Perturbe':  { interno: 'nao_perturbe',       label: 'Não Perturbe'       },
  'NAO PERTURBE':  { interno: 'nao_perturbe',       label: 'Não Perturbe'       },
  'N.Q.A.':        { interno: 'nao_quis_arrumacao', label: 'Não quis arrumação' },
  'NQA':           { interno: 'nao_quis_arrumacao', label: 'Não quis arrumação' },
  'Dormiu Fora':   { interno: 'nao_quis_arrumacao', label: 'Dormiu Fora'        },
  'DORMIU FORA':   { interno: 'nao_quis_arrumacao', label: 'Dormiu Fora'        },
  'Teste TI':      { interno: 'bloqueado',          label: 'Teste TI'           },
  'TESTE TI':      { interno: 'bloqueado',          label: 'Teste TI'           },
  'BLOQUEADO':     { interno: 'bloqueado',          label: 'Bloqueado'          },
  'Bloqueado':     { interno: 'bloqueado',          label: 'Bloqueado'          },
  'INSPECAO':      { interno: 'inspecao',           label: 'Inspeção'           },
  'ARRUMACAO':     { interno: 'conferencia',        label: 'Arrumação'          },
  'MANUTENCAO':    { interno: 'manutencao',         label: 'Manutenção'         },
  'RESERVADO':     { interno: 'reservado',          label: 'Reservado'          },
};

// Col G = STATUS APTO (ocupação): Vago, Ocupado, Bloqueado
const _MAP_COL_G_APTO = {
  'VAGO':          { interno: 'vago',              label: 'Vago'               },
  'OCUPADO':       { interno: 'ocupado',           label: 'Ocupado'            },
  'BLOQUEADO':     { interno: 'bloqueado',         label: 'Bloqueado'          },
  'Nao Perturbe':  { interno: 'nao_perturbe',      label: 'Não Perturbe'       },
  'Não Perturbe':  { interno: 'nao_perturbe',      label: 'Não Perturbe'       },
  'NAO PERTURBE':  { interno: 'nao_perturbe',      label: 'Não Perturbe'       },
  'N.Q.A.':        { interno: 'nao_quis_arrumacao',label: 'Não quis arrumação' },
};

// Aliases para compatibilidade com código legado que usa _MAP_STATUS_APTO/_MAP_STATUS_GOV
const _MAP_STATUS_APTO = _MAP_COL_D_GOV;
const _MAP_STATUS_GOV  = _MAP_COL_G_APTO;

// Lookup normalizado: remove acentos e converte para maiúsculas
// Garante que "ARRUMACAO", "Arrumação" e "arrumacao" resolvam para o mesmo valor
function _xlsNormKey(s) {
  return String(s).toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}
const _MAP_D_NORM = Object.fromEntries(
  Object.entries(_MAP_COL_D_GOV).map(([k, v]) => [_xlsNormKey(k), v])
);
const _MAP_G_NORM = Object.fromEntries(
  Object.entries(_MAP_COL_G_APTO).map(([k, v]) => [_xlsNormKey(k), v])
);

// ══════════════════════════════════════════════════════════════════════════════
// ESTADO DO MÓDULO
// ══════════════════════════════════════════════════════════════════════════════

let _xlsRegistrosValidos  = [];   // registros prontos após parse+validação
let _xlsIgnoradas         = 0;
let _xlsInconsistencias   = [];   // conflitos de duplicata (excluídos do import)
let _xlsNaoReconhecidos   = [];   // status inválido mas importados parcialmente
let _xlsArquivoNome       = '';   // nome do arquivo — salvo na validação para uso no confirmar
let _xlsStatusSistema     = {};   // mapa numero → { status, status_apto } atual do banco
let _xlsModoConfirmacao   = 'geral'; // modo guardado quando modal de substituição abre

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
  return _MAP_STATUS_APTO[s] || _MAP_D_NORM[_xlsNormKey(s)] || null;
}

function normalizarStatusGovernanca(valor) {
  const s = String(valor ?? '').trim();
  return _MAP_STATUS_GOV[s] || _MAP_G_NORM[_xlsNormKey(s)] || null;
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
  const esperados = { 0: 'CODUH', 3: 'STATUS GOV', 6: 'STATUS APTO', 9: 'ADULTOS', 12: 'PARTIDA' };
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

        // Lê toda a planilha e detecta automaticamente a linha de cabeçalho
        // (a linha que tem "CODUH" na coluna A, independente do número da linha)
        const allRows = XLSX.utils.sheet_to_json(sh, { header: 1, range: 0, defval: '' });
        const headerRowIdx = allRows.findIndex(r =>
          String(r[0] ?? '').trim().toUpperCase() === 'CODUH'
        );
        // Se não encontrar CODUH, assume linha 5 por retrocompatibilidade
        const rows = headerRowIdx >= 0 ? allRows.slice(headerRowIdx) : allRows.slice(4);

        // Valida cabeçalhos (rows[0] = linha de cabeçalho encontrada)
        const cabValido = validarCabecalhosIntegracaoXls(rows);

        // Dados começam a partir de rows[1]
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
          // Col O (índice 14): formato "adultos/criancas1/criancas2"
          const colO        = String(row[14] ?? '').trim();
          const colOPartes  = colO.split('/').map(p => parseInt(p.trim()) || 0);
          const criancas    = (colOPartes[1] || 0) + (colOPartes[2] || 0);

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
            criancas,
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
          Cabeçalhos detectados automaticamente &nbsp;·&nbsp; Col A: CODUH obrigatório
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

      <!-- Confronto XLS vs Sistema -->
      <div id="xls-divergencias" style="display:none;margin-bottom:20px;"></div>

      <!-- Ação final -->
      <div style="display:flex;justify-content:flex-end;gap:12px;flex-wrap:wrap;align-items:center;">
        <button class="btn btn-outline" onclick="_xlsReset()">🗑️ Limpar</button>
        <button class="btn btn-primary" id="xls-btn-integrar" disabled
                onclick="_xlsConfirmar(false, _xlsModoSelecionado)">
          📊 Integrar Geral
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
  _xlsArquivoNome      = '';

  const resumo  = document.getElementById('xls-resumo');
  const preview = document.getElementById('xls-preview-wrap');
  const avisos  = document.getElementById('xls-avisos');
  const btnConf = document.getElementById('xls-btn-confirmar');

  if (resumo)  resumo.style.display  = 'none';
  if (preview) preview.style.display = 'none';
  if (avisos)  avisos.style.display  = 'none';
  if (btnConf) btnConf.disabled      = true;

  const divDiv  = document.getElementById('xls-divergencias');
  const btnInt  = document.getElementById('xls-btn-integrar');
  if (divDiv) divDiv.style.display = 'none';
  if (btnInt) btnInt.disabled      = true;
  _xlsStatusSistema = {};
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
  _xlsArquivoNome = file.name;   // depois do limpar, para não ser apagado

  try {
    const { rows, ignoradas, conflitos, cabValido, abaAviso } = await parseIntegracaoXlsFile(file);

    // Linhas com status não reconhecido (importadas parcialmente)
    const naoReconhecidos = rows.filter(r => !r.conflito && (r.incApto || r.incGov));

    // Consulta status atual de todos os aptos do arquivo no sistema
    let aptosPausadosValidacao = [];
    _xlsStatusSistema = {};
    try {
      const numerosNoArquivo = [...new Set(rows.map(r => r.numero).filter(Boolean))];
      if (numerosNoArquivo.length && hotelId) {
        const { data: aptosDB } = await supabaseClient
          .from('apartments')
          .select('numero, status, status_apto')
          .eq('hotel_id', hotelId)
          .eq('ativo', true)
          .in('numero', numerosNoArquivo);
        (aptosDB || []).forEach(a => { _xlsStatusSistema[a.numero] = a; });
        aptosPausadosValidacao = (aptosDB || [])
          .filter(a => a.status === 'pausado')
          .map(a => a.numero).sort();
      }
    } catch (_) { /* não bloqueia a validação */ }

    // Exibe avisos
    const avisosList = [];
    if (abaAviso)              avisosList.push({ tipo:'warn', msg: abaAviso });
    if (!cabValido.ok)         cabValido.erros.forEach(e => avisosList.push({ tipo:'error', msg: e }));
    if (conflitos.length)      avisosList.push({ tipo:'warn', msg: `${conflitos.length} apartamento(s) aparecem com dados conflitantes e foram destacados.` });
    if (naoReconhecidos.length) avisosList.push({ tipo:'warn', msg: `${naoReconhecidos.length} apartamento(s) com status não reconhecido — importados com status parcial.` });
    if (aptosPausadosValidacao.length) avisosList.push({
      tipo:'pausado',
      msg: `${aptosPausadosValidacao.length} apartamento(s) com limpeza pausada — status de governança será preservado: <strong>${aptosPausadosValidacao.join(', ')}</strong>`,
    });

    if (avisosList.length) {
      avisos.innerHTML = avisosList.map(a => {
        const bg  = a.tipo==='error' ? '#fee2e2' : a.tipo==='pausado' ? '#eff6ff' : '#fef9c3';
        const brd = a.tipo==='error' ? '#fca5a5' : a.tipo==='pausado' ? '#93c5fd' : '#fde68a';
        const cor = a.tipo==='error' ? '#991b1b' : a.tipo==='pausado' ? '#1e40af' : '#92400e';
        const ico = a.tipo==='error' ? '❌'      : a.tipo==='pausado' ? '⏸'      : '⚠️';
        return `<div style="padding:10px 16px;border-radius:8px;margin-bottom:8px;font-size:13px;
          background:${bg};border:1px solid ${brd};color:${cor};">
          ${ico} ${a.msg}
        </div>`;
      }).join('');
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

    // Divergências: confronto XLS governança vs sistema
    _xlsRenderDivergencias(_xlsRegistrosValidos, _xlsStatusSistema);

    // Habilita botão de integração
    const temRegistros = _xlsRegistrosValidos.length > 0;
    const btnInt = document.getElementById('xls-btn-integrar');
    if (btnInt) btnInt.disabled = !temRegistros;
    const btnConf = document.getElementById('xls-btn-confirmar');
    if (btnConf) btnConf.disabled = true;

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

// ══════════════════════════════════════════════════════════════════════════════
// CONFRONTO XLS vs SISTEMA
// ══════════════════════════════════════════════════════════════════════════════

// Modo selecionado no confronto: 'geral' | 'status_apto'
let _xlsModoSelecionado = 'geral';

function _xlsSetModo(modo) {
  _xlsModoSelecionado = modo;
  document.querySelectorAll('.xls-modo-btn').forEach(b => {
    const ativo = b.dataset.modo === modo;
    b.style.background    = ativo ? 'var(--primary, #2563eb)' : '#fff';
    b.style.color         = ativo ? '#fff' : 'var(--text2, #374151)';
    b.style.borderColor   = ativo ? 'var(--primary, #2563eb)' : '#d1d5db';
    b.style.fontWeight    = ativo ? '700' : '500';
  });
  // Atualiza a tabela de previsão com o modo selecionado
  const el = document.getElementById('xls-divergencias');
  if (el && el._dadosLinhas) _xlsRenderTabelaConfronto(el, el._dadosLinhas, el._total);
  // Sincroniza botão de integrar
  const btnInt = document.getElementById('xls-btn-integrar');
  if (btnInt) {
    btnInt.textContent = modo === 'geral' ? '📊 Integrar Geral' : '🏠 Integrar Status Apto';
    btnInt.onclick = () => _xlsConfirmar(false, modo);
  }
}

// Deriva a nova ocupação (status_apto) a partir do XLS Col G
function _xlsNovaOcupacao(xlsApto) {
  if (xlsApto === 'ocupado' || xlsApto === 'nao_perturbe') return 'Ocupado';
  if (xlsApto === 'vago')      return 'Vago';
  if (xlsApto === 'bloqueado') return 'Bloqueado';
  return null;
}

// Novo status de limpeza (status) resultante APENAS da Col D, ignorando ocupação
// Usado para mostrar na coluna Limpeza sem misturar com ocupação
function _xlsNovaLimpeza(xlsGov) {
  // xlsGov = valor interno da Col D (limpo, sujo, conferencia, inspecao, manutencao, nao_perturbe, nao_quis_arrumacao, reservado, site, bloqueado)
  const mapLimp = {
    limpo:              'limpo',
    sujo:               'sujo',
    conferencia:        'conferencia',
    inspecao:           'inspecao',
    manutencao:         'manutencao',
    nao_perturbe:       'nao_perturbe',
    nao_quis_arrumacao: 'nao_quis_arrumacao',
    reservado:          'ocupado',   // reservado → sistema trata como ocupado
    site:               'ocupado',   // site → sistema trata como ocupado
    bloqueado:          'bloqueado',
  };
  return mapLimp[xlsGov] || null;
}

function _xlsRenderTabelaConfronto(el, linhas, total) {
  const modo    = _xlsModoSelecionado;
  const _SL     = (typeof _STATUS_LABELS !== 'undefined') ? _STATUS_LABELS : {};
  const _SI     = (typeof _STATUS_ICONS  !== 'undefined') ? _STATUS_ICONS  : {};

  const _COR_LIMP = {
    sujo:'#e67e22', limpando:'#2e86c1', pausado:'#f39c12',
    conferencia:'#8e44ad', limpo:'#1abc9c', reprovado:'#e74c3c',
    bloqueado:'#c0392b', ocupado:'#7f8c8d', manutencao:'#f1c40f',
    inspecao:'#0891b2', nao_perturbe:'#6366f1', nao_quis_arrumacao:'#94a3b8',
  };
  const _COR_OCUP = { Vago:'#27ae60', Ocupado:'#7f8c8d', Bloqueado:'#c0392b' };

  // Badge para status de limpeza (nunca mostra 'vago'/'vago' — esses são ocupação)
  const _badgeL = (interno, destaque) => {
    if (!interno) return '<span style="color:#9ca3af;font-size:11px;">—</span>';
    const cor   = _COR_LIMP[interno] || '#6b7280';
    const lbl   = _SL[interno] || interno;
    const ico   = _SI[interno] || '';
    const borda = destaque ? `border:2px solid ${cor};` : `border:1px solid ${cor}44;`;
    return `<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;background:${cor}22;color:${cor};${borda}">${ico} ${lbl}</span>`;
  };

  // Badge para ocupação (Vago/Ocupado/Bloqueado)
  const _badgeO = (val, destaque) => {
    if (!val) return '<span style="color:#9ca3af;font-size:11px;">—</span>';
    const cor   = _COR_OCUP[val] || '#6b7280';
    const borda = destaque ? `border:2px solid ${cor};` : `border:1px solid ${cor}44;`;
    return `<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;background:${cor}22;color:${cor};${borda}">🏠 ${val}</span>`;
  };

  const _seta = `<span style="color:#9ca3af;font-size:13px;padding:0 4px;">→</span>`;
  const _ok   = `<span style="color:#16a34a;font-size:11px;font-weight:600;">✔ sem alteração</span>`;

  // Enriquece cada linha
  const linhasCalc = linhas.map(l => {
    // xlsGov = Col D (limpeza), xlsApto = Col G (ocupação)
    const novaLimpeza  = _xlsNovaLimpeza(l.xlsGov);        // novo status de limpeza baseado só na Col D
    const novaOcupacao = _xlsNovaOcupacao(l.xlsApto);      // novo status_apto baseado na Col G
    const ocupAtual    = l.sist?.status_apto || null;

    // Status de limpeza atual: extrai da combinação do status atual, excluindo 'vago' e 'ocupado'
    // 'vago' no sistema = vago+limpo → para exibição de limpeza, é 'limpo'
    // 'ocupado' no sistema = ocupado+limpo → para exibição de limpeza, é 'limpo'
    const limpAtualDisplay = (l.sistStatus === 'vago' || l.sistStatus === 'ocupado') ? 'limpo' : l.sistStatus;

    const mudaLimpeza  = novaLimpeza  !== null && novaLimpeza  !== limpAtualDisplay;
    const mudaOcupacao = novaOcupacao !== null && novaOcupacao !== ocupAtual;

    // Para modo status_apto: também verifica efeito colateral no status de limpeza
    const novaLimpezaSA   = l.statusAptoResultado;
    const limpSADisplay   = (novaLimpezaSA === 'vago' || novaLimpezaSA === 'ocupado') ? 'limpo' : novaLimpezaSA;
    const mudaLimpezaSA   = limpSADisplay !== limpAtualDisplay;

    const mudaNoModo = modo === 'geral'
      ? (mudaLimpeza || mudaOcupacao)
      : mudaOcupacao;

    return { ...l, novaLimpeza, novaOcupacao, ocupAtual, limpAtualDisplay,
             mudaLimpeza, mudaOcupacao, novaLimpezaSA: limpSADisplay, mudaLimpezaSA, mudaNoModo };
  });

  const comMudanca = linhasCalc.filter(l => l.mudaNoModo);
  const semMudanca = linhasCalc.filter(l => !l.mudaNoModo);

  const tabelaEl = document.getElementById('xls-conf-tabela');
  if (!tabelaEl) return;

  if (comMudanca.length === 0) {
    tabelaEl.innerHTML = `<div style="text-align:center;padding:20px;color:#16a34a;font-weight:600;">
      ✅ Nenhuma alteração seria feita com este modo.
    </div>`;
    return;
  }

  if (modo === 'status_apto') {
    // ── Integrar Status Apto: SOMENTE Ocupação — não altera nem mostra Limpeza
    tabelaEl.innerHTML = `
      <div style="font-size:11px;color:#6b7280;margin-bottom:8px;padding:6px 10px;background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb;">
        Atualiza apenas a <strong>Ocupação</strong> (Vago / Ocupado / Bloqueado). O Status de Limpeza/Governança não é alterado.
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#f3f4f6;text-align:left;">
            <th style="padding:8px 10px;border-bottom:2px solid #e5e7eb;width:60px;">Apto</th>
            <th style="padding:8px 10px;border-bottom:2px solid #e5e7eb;" colspan="3">🏠 Ocupação (Sistema x XLS)</th>
          </tr>
        </thead>
        <tbody>
          ${comMudanca.map(l => {
            const ocupCell = l.mudaOcupacao
              ? `${_badgeO(l.ocupAtual,false)} ${_seta} ${_badgeO(l.novaOcupacao,true)}`
              : _ok;
            return `<tr style="border-bottom:1px solid #f3f4f6;">
              <td style="padding:8px 10px;font-weight:700;font-size:13px;">${l.r.numero}</td>
              <td style="padding:8px 10px;" colspan="3">${ocupCell}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      ${_xlsSemMudancaHtml(semMudanca, _badgeO, _badgeL, _ok)}`;

  } else {
    // ── Integrar Geral: Limpeza (Col D) e Ocupação (Col G) separadas ─────────
    tabelaEl.innerHTML = `
      <div style="font-size:11px;color:#6b7280;margin-bottom:8px;padding:6px 10px;background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb;">
        Atualiza o <strong>Status de Limpeza</strong> conforme Col D do XLS (Sujo, Limpo, Arrumação, etc.)
        <em>e</em> a <strong>Ocupação</strong> conforme Col G (Vago / Ocupado / Bloqueado).
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#f3f4f6;text-align:left;">
            <th style="padding:8px 10px;border-bottom:2px solid #e5e7eb;width:60px;">Apto</th>
            <th style="padding:8px 10px;border-bottom:2px solid #e5e7eb;border-right:2px solid #e5e7eb;" colspan="3">🧹 Limpeza (Sistema x XLS)</th>
            <th style="padding:8px 10px;border-bottom:2px solid #e5e7eb;" colspan="3">🏠 Ocupação (Sistema x XLS)</th>
          </tr>
        </thead>
        <tbody>
          ${comMudanca.map(l => {
            const limpCell = l.mudaLimpeza
              ? `${_badgeL(l.limpAtualDisplay,false)} ${_seta} ${_badgeL(l.novaLimpeza,true)}`
              : _ok;
            const ocupCell = l.mudaOcupacao
              ? `${_badgeO(l.ocupAtual,false)} ${_seta} ${_badgeO(l.novaOcupacao,true)}`
              : _ok;
            return `<tr style="border-bottom:1px solid #f3f4f6;">
              <td style="padding:8px 10px;font-weight:700;font-size:13px;">${l.r.numero}</td>
              <td style="padding:8px 10px;border-right:1px solid #f3f4f6;" colspan="3">${limpCell}</td>
              <td style="padding:8px 10px;" colspan="3">${ocupCell}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      ${_xlsSemMudancaHtml(semMudanca, _badgeO, _badgeL, _ok)}`;
  }
}

function _xlsSemMudancaHtml(semMudanca, _badgeO, _badgeL, _ok) {
  if (!semMudanca.length) return '';
  return `
    <div style="margin-top:12px;">
      <button onclick="_xlsToggleSemMudanca(this)"
        style="background:none;border:none;cursor:pointer;font-size:11px;color:#6b7280;padding:4px 0;text-decoration:underline;">
        ▶ Ver ${semMudanca.length} apto(s) sem alteração neste modo
      </button>
      <div id="xls-sem-mudanca" style="display:none;margin-top:8px;opacity:.65;">
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <tbody>
            ${semMudanca.map(l => `
              <tr style="border-bottom:1px solid #f9fafb;">
                <td style="padding:4px 10px;font-weight:600;width:60px;">${l.r.numero}</td>
                <td style="padding:4px 10px;">${_badgeL(l.sistStatus,false)}</td>
                <td style="padding:4px 10px;">${_badgeO(l.ocupAtual,false)}</td>
                <td style="padding:4px 10px;color:#16a34a;font-weight:600;">✔ Sem alteração</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function _xlsToggleSemMudanca(btn) {
  const div = document.getElementById('xls-sem-mudanca');
  if (!div) return;
  const aberto = div.style.display !== 'none';
  div.style.display = aberto ? 'none' : '';
  const n = div.querySelectorAll('tr').length;
  btn.textContent = aberto ? `▶ Ver ${n} apto(s) sem alteração neste modo` : `▼ Ocultar aptos sem alteração`;
}

function _xlsRenderDivergencias(registros, sistemaMap) {
  const el = document.getElementById('xls-divergencias');
  if (!el) return;

  const _COR = {
    vago:'#27ae60', sujo:'#e67e22', limpando:'#2e86c1', pausado:'#f39c12',
    conferencia:'#8e44ad', limpo:'#1abc9c', reprovado:'#e74c3c',
    bloqueado:'#c0392b', ocupado:'#7f8c8d', manutencao:'#f1c40f', inspecao:'#0891b2',
  };

  // Espelha a lógica CASE do RPC modo 'geral'
  function _calcGeral(xlsApto, xlsGov, sistAtual) {
    if (sistAtual === 'pausado') return 'pausado';
    if (xlsApto === 'bloqueado') return 'bloqueado';
    if (xlsApto === 'nao_perturbe') return 'ocupado';
    if (xlsApto === 'ocupado') {
      if (xlsGov === 'limpo')       return 'ocupado';
      if (xlsGov === 'sujo')        return 'sujo';
      if (xlsGov === 'conferencia') return 'conferencia';
      if (xlsGov === 'inspecao')    return 'inspecao';
      if (xlsGov === 'manutencao')  return 'manutencao';
      if (xlsGov === 'nao_perturbe' || xlsGov === 'nao_quis_arrumacao') return 'ocupado';
    }
    if (xlsApto === 'vago') {
      if (xlsGov === 'limpo')       return 'vago';
      if (xlsGov === 'sujo')        return 'sujo';
      if (xlsGov === 'conferencia') return 'conferencia';
      if (xlsGov === 'inspecao')    return 'inspecao';
      if (xlsGov === 'manutencao')  return 'manutencao';
    }
    if (xlsGov === 'reservado' || xlsGov === 'site') return 'ocupado';
    if (xlsGov === 'manutencao') return 'manutencao';
    return sistAtual;
  }

  // Espelha a lógica CASE do RPC modo 'status_apto'
  function _calcStatusApto(xlsApto, sistAtual) {
    if (sistAtual === 'pausado') return 'pausado';
    if (xlsApto === 'bloqueado') return 'bloqueado';
    if ((xlsApto === 'ocupado' || xlsApto === 'nao_perturbe') &&
        (sistAtual === 'vago' || sistAtual === 'sujo' || sistAtual === 'limpo')) return 'ocupado';
    if (xlsApto === 'vago' && sistAtual === 'ocupado') return 'sujo';
    return sistAtual;
  }

  const linhas = registros.map(r => {
    const sist = sistemaMap[r.numero];
    if (!sist) return null;
    const xlsGov          = r.statusApto?.interno || null;
    const xlsApto         = r.statusGov?.interno  || null;
    const sistStatus      = sist.status;
    const geralResultado  = _calcGeral(xlsApto, xlsGov, sistStatus);
    const statusAptoResultado = _calcStatusApto(xlsApto, sistStatus);
    return { r, sist, xlsGov, xlsApto, sistStatus, geralResultado, statusAptoResultado };
  }).filter(Boolean);

  const total = linhas.length;
  // Contagem real usando mesma lógica do _xlsRenderTabelaConfronto
  const comMudancaG = linhas.filter(l => {
    const novaLimp = _xlsNovaLimpeza(l.xlsGov);
    const novaOcup = _xlsNovaOcupacao(l.xlsApto);
    const limpAtual = (l.sistStatus === 'vago' || l.sistStatus === 'ocupado') ? 'limpo' : l.sistStatus;
    return (novaLimp !== null && novaLimp !== limpAtual) ||
           (novaOcup !== null && novaOcup !== (l.sist?.status_apto || null));
  }).length;
  const comMudancaSA = linhas.filter(l => {
    const novaOcup = _xlsNovaOcupacao(l.xlsApto);
    return novaOcup !== null && novaOcup !== (l.sist?.status_apto || null);
  }).length;

  // Guarda dados para re-render ao trocar modo
  el._dadosLinhas = linhas;
  el._total       = total;

  el.innerHTML = `
    <div class="card" style="padding:20px 24px;">

      <!-- Cabeçalho -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
        <div style="font-weight:700;font-size:14px;">🔍 Prévia da Integração</div>
        <div style="font-size:12px;color:#6b7280;">${total} apto(s) no arquivo</div>
      </div>

      <!-- Seletor de modo -->
      <div style="margin-bottom:16px;">
        <div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;">Selecione o modo de integração</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="xls-modo-btn" data-modo="geral"
            onclick="_xlsSetModo('geral')"
            style="padding:8px 16px;border-radius:8px;border:2px solid #2563eb;background:#2563eb;color:#fff;font-weight:700;font-size:12px;cursor:pointer;transition:all .15s;">
            📊 Integrar Geral
            <span style="display:block;font-size:10px;font-weight:400;margin-top:2px;opacity:.85;">${comMudancaG} apto(s) serão alterados</span>
          </button>
          <button class="xls-modo-btn" data-modo="status_apto"
            onclick="_xlsSetModo('status_apto')"
            style="padding:8px 16px;border-radius:8px;border:2px solid #d1d5db;background:#fff;color:#374151;font-weight:500;font-size:12px;cursor:pointer;transition:all .15s;">
            🏠 Integrar Status Apto
            <span style="display:block;font-size:10px;font-weight:400;margin-top:2px;opacity:.7;">${comMudancaSA} apto(s) serão alterados</span>
          </button>
        </div>
        <div id="xls-modo-desc" style="margin-top:10px;font-size:11px;color:#6b7280;padding:8px 12px;background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb;">
          <strong>Integrar Geral:</strong> atualiza ocupação <em>e</em> status de governança (sujo, em limpeza, etc.) conforme o XLS.
          <span id="xls-modo-desc-extra" style="display:none;"><br><strong>Integrar Status Apto:</strong> atualiza apenas Vago/Ocupado/Bloqueado — preserva o status de governança atual do sistema.</span>
        </div>
      </div>

      <!-- Tabela de prévia (re-renderizada ao trocar modo) -->
      <div id="xls-conf-tabela"></div>

    </div>`;

  el.style.display = '';

  // Render inicial com modo atual
  _xlsRenderTabelaConfronto(el, linhas, total);

  // Listener para atualizar descrição ao trocar modo
  el.querySelectorAll('.xls-modo-btn').forEach(b => {
    b.addEventListener('click', () => {
      const desc  = document.getElementById('xls-modo-desc');
      const extra = document.getElementById('xls-modo-desc-extra');
      if (!desc) return;
      if (b.dataset.modo === 'geral') {
        desc.innerHTML = '<strong>Integrar Geral:</strong> atualiza ocupação <em>e</em> status de governança (sujo, em limpeza, etc.) conforme o XLS.';
      } else {
        desc.innerHTML = '<strong>Integrar Status Apto:</strong> atualiza apenas Vago/Ocupado/Bloqueado — preserva o status de governança atual do sistema.';
      }
    });
  });
}

function _xlsReset() {
  _xlsRegistrosValidos = [];
  _xlsIgnoradas        = 0;
  _xlsInconsistencias  = [];
  _xlsNaoReconhecidos  = [];
  _xlsArquivoNome      = '';

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

async function _xlsConfirmar(substituir = false, modo = 'geral') {
  // ── Validações de pré-condição ───────────────────────────────────────────
  const hotelId = _xlsGetHotelId();
  if (!hotelId) { toast('Selecione o hotel antes de confirmar.', 'error'); return; }

  const dataEl = document.getElementById('xls-data');
  const dataIntegracao = dataEl?.value?.trim();
  if (!dataIntegracao) { toast('Informe a data da integração.', 'error'); return; }

  const arquivoNome = _xlsArquivoNome;
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
    criancas:                  r.criancas              ?? 0,
    data_partida:              r.dataPartida           || null,
  }));

  const totalLinhas          = _xlsRegistrosValidos.length + _xlsIgnoradas + _xlsInconsistencias.length;
  const totalImportadas      = _xlsRegistrosValidos.length;
  const totalIgnoradas       = _xlsIgnoradas;
  const totalInconsistencias = _xlsInconsistencias.length + _xlsNaoReconhecidos.length;

  // ── UI: bloqueia botão durante gravação ──────────────────────────────────
  const btnConf = document.getElementById('xls-btn-confirmar');
  const btnInt  = document.getElementById('xls-btn-integrar');
  if (btnConf) { btnConf.disabled = true; btnConf.textContent = '⏳ Salvando...'; }
  if (btnInt)  { btnInt.disabled  = true; btnInt.textContent  = '⏳ Salvando...'; }

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
        p_modo:                   modo,
      }
    );

    if (error) {
      console.error('RPC importar_integracao_xls_status_diario:', error);
      toast('Erro: ' + (error.message || error.code || JSON.stringify(error)), 'error');
      return;
    }

    // ── Trata retornos controlados da RPC ────────────────────────────────
    if (!data?.ok) {
      if (data?.erro === 'ja_existe') {
        _xlsConfirmarSubstituicao(data.mensagem, modo);
        return;
      }
      toast(data?.mensagem || data?.erro || 'Erro ao salvar integração. Tente novamente.', 'error');
      return;
    }

    // ── Sucesso ──────────────────────────────────────────────────────────
    const totalAtualizados = data?.total_aptos_atualizados ?? totalImportadas;
    const modoLabel = modo === 'status_apto' ? 'Status Apto' : 'Geral';
    const msgSucesso = substituir
      ? `Integração ${modoLabel} substituída. ${totalAtualizados} apartamentos atualizados.`
      : `Integração ${modoLabel} confirmada. ${totalAtualizados} apartamentos atualizados.`;

    toast(msgSucesso, 'success');

    // Aviso de aptos pausados preservados
    const aptosPausados = data?.aptos_pausados;
    if (Array.isArray(aptosPausados) && aptosPausados.length > 0) {
      _xlsExibirAvisoPausados(aptosPausados.length, aptosPausados.join(', '));
    }

    // Bloqueia botões após gravação bem-sucedida
    const _labelSalvo = '✅ Integração salva';
    if (btnConf) { btnConf.disabled = true; btnConf.textContent = _labelSalvo; }
    if (btnInt)  { btnInt.disabled  = true; btnInt.textContent  = _labelSalvo; }

  } catch (err) {
    console.error('_xlsConfirmar:', err);
    toast('Erro ao salvar integração. Tente novamente.', 'error');
  } finally {
    const intEl = document.getElementById('xls-btn-integrar');
    if (intEl && intEl.textContent === '⏳ Salvando...') {
      intEl.disabled    = false;
      intEl.textContent = _xlsModoSelecionado === 'status_apto' ? '🏠 Integrar Status Apto' : '📊 Integrar Geral';
    }
  }
}

// ── Diálogo de confirmação de substituição ────────────────────────────────────
function _xlsExibirAvisoPausados(qtd, lista) {
  const modalId = 'modal-xls-pausados';
  let modal = document.getElementById(modalId);
  if (!modal) {
    modal = document.createElement('div');
    modal.id        = modalId;
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:480px;">
        <div class="modal-header">
          <div class="modal-title">⏸ Apartamentos em Pausa — status preservado</div>
          <button class="btn-close" onclick="closeModal('${modalId}')">✕</button>
        </div>
        <div class="modal-body">
          <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.6;">
            <strong id="xls-pausados-qtd"></strong> apartamento(s) estão com limpeza pausada e
            <strong>não tiveram o status de governança alterado</strong> pela integração XLS.
            O status de ocupação (Vago/Ocupado) foi atualizado normalmente.
          </p>
          <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:10px 14px;font-size:13px;color:#92400e;">
            ⚠️ Aptos pausados: <strong id="xls-pausados-lista"></strong>
          </div>
          <p style="margin:12px 0 0;font-size:12px;color:#6b7280;">
            Retome ou conclua a limpeza no fluxo de governança para liberar esses apartamentos.
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" onclick="closeModal('${modalId}')">Entendido</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  document.getElementById('xls-pausados-qtd').textContent  = qtd;
  document.getElementById('xls-pausados-lista').textContent = lista;
  openModal(modalId);
}

function _xlsConfirmarSubstituicao(mensagemRpc, modo) {
  _xlsModoConfirmacao = modo || 'geral';
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
                    onclick="closeModal('${modalId}');_xlsConfirmar(true,_xlsModoConfirmacao)">
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
