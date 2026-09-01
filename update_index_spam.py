import re

with open('templates/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update spamTabs to include the "Inteligência SPAM" tab
old_tabs_pattern = r'<ul class="nav nav-tabs mb-4" id="spamTabs" role="tablist">.*?<button class="nav-link active fw-bold small text-dark d-flex align-items-center gap-2" id="spam-calib-tab".*?Calibração de Pesos & Regras.*?</button>.*?</li>'
match_tabs = re.search(old_tabs_pattern, content, re.DOTALL)

if match_tabs:
    calib_li = match_tabs.group(0)
    new_intelligence_li = """                        <li class="nav-item" role="presentation">
                            <button class="nav-link fw-bold small text-muted d-flex align-items-center gap-2" id="spam-intelligence-tab" data-bs-toggle="tab" data-bs-target="#spam-tab-intelligence" type="button" role="tab">
                                <i class="bi bi-magic text-warning"></i> Inteligência SPAM (Regras Heurísticas & Regex)
                                <span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-pill font-monospace" id="badge-heuristic-all">10</span>
                            </button>
                        </li>"""
    # Check if spam-intelligence-tab already in tabs
    if 'id="spam-intelligence-tab"' not in content:
        content = content[:match_tabs.end()] + "\n" + new_intelligence_li + content[match_tabs.end():]
        print("Added spam-intelligence-tab to spamTabs!")
    else:
        print("spam-intelligence-tab already exists in spamTabs.")
else:
    print("Could not find spamTabs calibration li.")

# 2. Add the complete HTML content pane for #spam-tab-intelligence
intelligence_pane_html = """                        <!-- ============================================================== -->
                        <!-- TAB 2: INTELIGÊNCIA SPAM (Regras Heurísticas & Regex Avançadas)   -->
                        <!-- ============================================================== -->
                        <div class="tab-pane fade" id="spam-tab-intelligence" role="tabpanel">
                            <!-- KPI Summary Cards -->
                            <div class="row g-3 mb-4">
                                <div class="col-md-3">
                                    <div class="card p-3 shadow-sm border-0 bg-light h-100">
                                        <div class="d-flex align-items-center justify-content-between">
                                            <div>
                                                <span class="text-muted small fw-semibold">Regras Inteligentes</span>
                                                <h3 class="fw-bold text-dark mb-0 fs-3" id="badge-custom-rules-count">10</h3>
                                            </div>
                                            <div class="p-3 bg-warning-subtle text-warning rounded-3">
                                                <i class="bi bi-magic fs-4"></i>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card p-3 shadow-sm border-0 bg-light h-100">
                                        <div class="d-flex align-items-center justify-content-between">
                                            <div>
                                                <span class="text-muted small fw-semibold">Phishing & Golpes</span>
                                                <h3 class="fw-bold text-danger mb-0 fs-3" id="kpi-custom-phishing">5</h3>
                                            </div>
                                            <div class="p-3 bg-danger-subtle text-danger rounded-3">
                                                <i class="bi bi-shield-slash fs-4"></i>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card p-3 shadow-sm border-0 bg-light h-100">
                                        <div class="d-flex align-items-center justify-content-between">
                                            <div>
                                                <span class="text-muted small fw-semibold">Links & URIs no E-mail</span>
                                                <h3 class="fw-bold text-info mb-0 fs-3" id="kpi-custom-links">2</h3>
                                            </div>
                                            <div class="p-3 bg-info-subtle text-info rounded-3">
                                                <i class="bi bi-link-45deg fs-4"></i>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="card p-3 shadow-sm border-0 bg-light h-100">
                                        <div class="d-flex align-items-center justify-content-between">
                                            <div>
                                                <span class="text-muted small fw-semibold">Ofuscação & Caracteres</span>
                                                <h3 class="fw-bold text-warning mb-0 fs-3" id="kpi-custom-obfuscation">3</h3>
                                            </div>
                                            <div class="p-3 bg-warning-subtle text-dark rounded-3">
                                                <i class="bi bi-fonts fs-4"></i>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Presets Rápidos de Inteligência AntiSPAM (1-Clique) -->
                            <div class="card p-4 shadow-sm border-0 mb-4 bg-light">
                                <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
                                    <div>
                                        <h6 class="fw-bold text-dark mb-1 d-flex align-items-center gap-2">
                                            <i class="bi bi-lightning-charge-fill text-warning"></i> Presets Rápidos de Inteligência AntiSPAM ZRTI
                                        </h6>
                                        <p class="text-muted small mb-0">Modelos prontos de Regex para interceptação de phishing moderno, links encurtados, IP direto e caracteres estranhos.</p>
                                    </div>
                                    <button type="button" class="btn btn-primary btn-sm px-3 shadow-sm" onclick="openNewCustomSpamRuleModal()">
                                        <i class="bi bi-plus-circle-fill me-1"></i> Nova Regra Inteligente (Regex)
                                    </button>
                                </div>
                                <div class="row g-2">
                                    <div class="col-md-3 col-sm-6">
                                        <button type="button" class="btn btn-white w-100 text-start border shadow-sm p-2.5 h-100 hover-shadow transition" onclick="applySpamHeuristicPreset('pedagio')">
                                            <div class="d-flex align-items-center gap-2 mb-1">
                                                <span class="badge bg-danger-subtle text-danger"><i class="bi bi-shield-x"></i> Phishing</span>
                                                <span class="badge bg-danger text-white font-monospace ms-auto">+15.0</span>
                                            </div>
                                            <strong class="d-block text-dark small">Golpe Pedágio / Rodovia</strong>
                                            <span class="text-muted font-monospace" style="font-size: 11px;">/ped.gios?|vi.ria|rodovi.rio/i</span>
                                        </button>
                                    </div>
                                    <div class="col-md-3 col-sm-6">
                                        <button type="button" class="btn btn-white w-100 text-start border shadow-sm p-2.5 h-100 hover-shadow transition" onclick="applySpamHeuristicPreset('remetente_falso')">
                                            <div class="d-flex align-items-center gap-2 mb-1">
                                                <span class="badge bg-danger-subtle text-danger"><i class="bi bi-person-x"></i> Phishing</span>
                                                <span class="badge bg-danger text-white font-monospace ms-auto">+15.0</span>
                                            </div>
                                            <strong class="d-block text-dark small">Remetente Falso / Cobrança</strong>
                                            <span class="text-muted font-monospace" style="font-size: 11px;">/Regulariza..o|Cobran.a|ReclameAqui/i</span>
                                        </button>
                                    </div>
                                    <div class="col-md-3 col-sm-6">
                                        <button type="button" class="btn btn-white w-100 text-start border shadow-sm p-2.5 h-100 hover-shadow transition" onclick="applySpamHeuristicPreset('links_suspeitos')">
                                            <div class="d-flex align-items-center gap-2 mb-1">
                                                <span class="badge bg-info-subtle text-info"><i class="bi bi-link"></i> Link no E-mail</span>
                                                <span class="badge bg-danger text-white font-monospace ms-auto">+12.0</span>
                                            </div>
                                            <strong class="d-block text-dark small">Links Encurtados / Suspeitos</strong>
                                            <span class="text-muted font-monospace" style="font-size: 11px;">uri: bit.ly|tinyurl|is.gd|cutt.ly</span>
                                        </button>
                                    </div>
                                    <div class="col-md-3 col-sm-6">
                                        <button type="button" class="btn btn-white w-100 text-start border shadow-sm p-2.5 h-100 hover-shadow transition" onclick="applySpamHeuristicPreset('link_ip_direto')">
                                            <div class="d-flex align-items-center gap-2 mb-1">
                                                <span class="badge bg-info-subtle text-info"><i class="bi bi-hdd-network"></i> Link IP Direto</span>
                                                <span class="badge bg-danger text-white font-monospace ms-auto">+14.0</span>
                                            </div>
                                            <strong class="d-block text-dark small">Link com IP Direto no E-mail</strong>
                                            <span class="text-muted font-monospace" style="font-size: 11px;">uri: https?://185.x.x.x</span>
                                        </button>
                                    </div>
                                    <div class="col-md-3 col-sm-6">
                                        <button type="button" class="btn btn-white w-100 text-start border shadow-sm p-2.5 h-100 hover-shadow transition" onclick="applySpamHeuristicPreset('caracteres_estranhos')">
                                            <div class="d-flex align-items-center gap-2 mb-1">
                                                <span class="badge bg-warning-subtle text-dark"><i class="bi bi-fonts"></i> Ofuscação</span>
                                                <span class="badge bg-warning text-dark font-monospace ms-auto">+10.0</span>
                                            </div>
                                            <strong class="d-block text-dark small">Caracteres Estranhos & Charset</strong>
                                            <span class="text-muted font-monospace" style="font-size: 11px;">Zero-Width / Homógrafos / Cirílico</span>
                                        </button>
                                    </div>
                                    <div class="col-md-3 col-sm-6">
                                        <button type="button" class="btn btn-white w-100 text-start border shadow-sm p-2.5 h-100 hover-shadow transition" onclick="applySpamHeuristicPreset('assunto_quebrado')">
                                            <div class="d-flex align-items-center gap-2 mb-1">
                                                <span class="badge bg-warning-subtle text-dark"><i class="bi bi-question-diamond"></i> Charset</span>
                                                <span class="badge bg-warning text-dark font-monospace ms-auto">+5.0</span>
                                            </div>
                                            <strong class="d-block text-dark small">Assunto Quebrado (??)</strong>
                                            <span class="text-muted font-monospace" style="font-size: 11px;">/\?{2,}/</span>
                                        </button>
                                    </div>
                                    <div class="col-md-3 col-sm-6">
                                        <button type="button" class="btn btn-white w-100 text-start border shadow-sm p-2.5 h-100 hover-shadow transition" onclick="applySpamHeuristicPreset('pix_fatura')">
                                            <div class="d-flex align-items-center gap-2 mb-1">
                                                <span class="badge bg-danger-subtle text-danger"><i class="bi bi-receipt"></i> Golpe PIX</span>
                                                <span class="badge bg-danger text-white font-monospace ms-auto">+12.0</span>
                                            </div>
                                            <strong class="d-block text-dark small">Falso PIX / Boleto / Fatura</strong>
                                            <span class="text-muted font-monospace" style="font-size: 11px;">/comprovante.*pix|fatura.*vencida/i</span>
                                        </button>
                                    </div>
                                    <div class="col-md-3 col-sm-6">
                                        <button type="button" class="btn btn-white w-100 text-start border shadow-sm p-2.5 h-100 hover-shadow transition" onclick="applySpamHeuristicPreset('replyto_sequestrado')">
                                            <div class="d-flex align-items-center gap-2 mb-1">
                                                <span class="badge bg-danger-subtle text-danger"><i class="bi bi-reply"></i> Reply-To</span>
                                                <span class="badge bg-danger text-white font-monospace ms-auto">+15.0</span>
                                            </div>
                                            <strong class="d-block text-dark small">Reply-To Domínio Sequestrado</strong>
                                            <span class="text-muted font-monospace" style="font-size: 11px;">Reply-To =~ /dominio_alheio/i</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <!-- Filtros e Tabela de Regras Heurísticas -->
                            <div class="card p-4 shadow-sm border-0 mb-4">
                                <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3 pb-3 border-bottom">
                                    <div class="d-flex flex-wrap align-items-center gap-2">
                                        <button class="btn btn-sm btn-outline-secondary active" id="btn-custom-filter-all" onclick="filterCustomSpamRules('all')">
                                            Todas as Regras
                                        </button>
                                        <button class="btn btn-sm btn-outline-danger" id="btn-custom-filter-phishing" onclick="filterCustomSpamRules('phishing')">
                                            <i class="bi bi-shield-slash me-1"></i> Phishing & Golpes
                                        </button>
                                        <button class="btn btn-sm btn-outline-info" id="btn-custom-filter-links" onclick="filterCustomSpamRules('links')">
                                            <i class="bi bi-link-45deg me-1"></i> Links no E-mail
                                        </button>
                                        <button class="btn btn-sm btn-outline-warning" id="btn-custom-filter-obfuscation" onclick="filterCustomSpamRules('obfuscation')">
                                            <i class="bi bi-fonts me-1"></i> Ofuscação & Caracteres
                                        </button>
                                        <button class="btn btn-sm btn-outline-secondary" id="btn-custom-filter-hijack" onclick="filterCustomSpamRules('hijack')">
                                            <i class="bi bi-reply me-1"></i> Reply-To Sequestrado
                                        </button>
                                    </div>
                                    <div class="d-flex align-items-center gap-2">
                                        <div class="input-group input-group-sm" style="max-width: 280px;">
                                            <span class="input-group-text bg-light border-end-0"><i class="bi bi-search text-muted"></i></span>
                                            <input type="text" class="form-control border-start-0" id="search-heuristic-rules-input" placeholder="Buscar regra, regex, alvo..." onkeyup="renderCustomSpamRulesTable()">
                                        </div>
                                    </div>
                                </div>

                                <div class="table-responsive">
                                    <table class="table table-hover align-middle mb-0">
                                        <thead class="table-light">
                                            <tr>
                                                <th style="width: 220px;">Identificador da Regra</th>
                                                <th style="width: 140px;">Campo Analisado</th>
                                                <th>Padrão Regex / Expressão Regular</th>
                                                <th class="text-center" style="width: 110px;">Score</th>
                                                <th>Descrição & Diagnóstico</th>
                                                <th class="text-center" style="width: 110px;">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody id="custom-rules-table-body">
                                            <tr><td colspan="6" class="text-center py-4 text-muted font-monospace small">Carregando regras da Inteligência SPAM...</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>"""

if 'id="spam-tab-intelligence"' not in content:
    # Insert before #spam-tab-lists
    pos_lists_pane = content.find('id="spam-tab-lists"')
    if pos_lists_pane != -1:
        # Find start of div containing spam-tab-lists
        div_start = content.rfind('<div class="tab-pane', 0, pos_lists_pane)
        if div_start != -1:
            content = content[:div_start] + intelligence_pane_html + "\n\n" + content[div_start:]
            print("Inserted #spam-tab-intelligence content pane successfully!")
        else:
            print("Could not find start of spam-tab-lists div.")
    else:
        print("Could not find id='spam-tab-lists' in index.html")
else:
    print("#spam-tab-intelligence already exists in index.html")

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
