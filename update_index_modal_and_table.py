import re

with open('templates/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add customSpamRuleModal
custom_modal_html = """    <!-- Modal: Criar / Editar Regra Inteligente AntiSPAM (Regex & Heurística) -->
    <div class="modal fade" id="customSpamRuleModal" tabindex="-1" aria-labelledby="customSpamRuleModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content border-0 shadow">
                <div class="modal-header bg-dark text-white">
                    <h5 class="modal-title fs-6 fw-bold d-flex align-items-center gap-2" id="customSpamRuleModalLabel">
                        <i class="bi bi-magic text-warning"></i> Configurar Regra da Inteligência AntiSPAM (Regex)
                    </h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <form id="form-custom-spam-rule" onsubmit="saveCustomSpamRule(event)">
                    <input type="hidden" id="custom-rule-old-name" value="">
                    <div class="modal-body p-4">
                        <!-- Mode Selector Pills -->
                        <div class="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">
                            <span class="small fw-bold text-dark">Modo de Configuração:</span>
                            <ul class="nav nav-pills nav-fill gap-2" id="pills-tab" role="tablist">
                                <li class="nav-item">
                                    <button class="btn btn-sm btn-outline-primary active" id="pills-friendly-tab" type="button" onclick="setCustomRuleModalMode('friendly')">
                                        <i class="bi bi-ui-checks me-1"></i> Modo Guiado (Palavras-chave)
                                    </button>
                                </li>
                                <li class="nav-item">
                                    <button class="btn btn-sm btn-outline-secondary" id="pills-regex-tab" type="button" onclick="setCustomRuleModalMode('regex')">
                                        <i class="bi bi-code-slash me-1"></i> Modo Regex Avançado
                                    </button>
                                </li>
                            </ul>
                        </div>

                        <!-- Friendly Mode Section -->
                        <div id="modal-mode-friendly-section" class="mb-3 p-3 bg-light rounded border">
                            <label class="form-label small fw-bold text-dark mb-1">Palavras-chave e Frases Suspeitas (Separadas por vírgula)</label>
                            <textarea class="form-control font-monospace form-control-sm" id="custom-rule-friendly-keywords" rows="3" placeholder="ex: pedagio, debito rodoviario, notificacao multa, regularizacao pendente" onkeyup="updateGeneratedPattern()"></textarea>
                            <div class="form-check mt-2">
                                <input class="form-check-input" type="checkbox" id="matchObfuscated" onchange="updateGeneratedPattern()">
                                <label class="form-check-label small text-muted" for="matchObfuscated">
                                    <i class="bi bi-shield-lock me-1"></i> Pegar também tentativas de ofuscação com símbolos e pontos (ex: P.e.d.a.g.i.o, P e d a g i o)
                                </label>
                            </div>
                        </div>

                        <!-- Regex Mode Section -->
                        <div id="modal-mode-regex-section" class="mb-3 d-none">
                            <label class="form-label small fw-bold text-dark mb-1">Expressão Regular (Pattern Regex do SpamAssassin)</label>
                            <input type="text" class="form-control font-monospace" id="custom-rule-pattern" placeholder="/ped.gios?|vi.ria|rodovi.rio/i" required>
                            <small class="text-muted" style="font-size: 11px;">Sintaxe padrão Perl Compatible Regular Expressions (PCRE), ex: <code>/termo1|termo2/i</code></small>
                        </div>

                        <div class="row g-3 mb-3">
                            <div class="col-md-6">
                                <label class="form-label small fw-bold text-dark mb-1">Campo / Alvo Analisado</label>
                                <select class="form-select" id="custom-rule-target">
                                    <option value="Subject">Assunto (Subject)</option>
                                    <option value="From">Remetente (From)</option>
                                    <option value="Reply-To">Endereço de Resposta (Reply-To)</option>
                                    <option value="To">Destinatário (To)</option>
                                    <option value="Body">Corpo do E-mail (Body)</option>
                                    <option value="URI">Links e URLs no E-mail (URI / Links)</option>
                                </select>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label small fw-bold text-dark mb-1">Impacto de Pontuação (Score)</label>
                                <div class="input-group">
                                    <input type="number" step="0.5" class="form-control font-monospace" id="custom-rule-score" value="15.0" required>
                                    <span class="input-group-text bg-light text-muted small">pontos</span>
                                </div>
                                <div class="d-flex gap-1 mt-1">
                                    <button type="button" class="badge bg-danger-subtle text-danger border border-danger-subtle cursor-pointer" onclick="document.getElementById('custom-rule-score').value='15.0'">+15.0 (Bloqueio Total)</button>
                                    <button type="button" class="badge bg-warning-subtle text-dark border border-warning-subtle cursor-pointer" onclick="document.getElementById('custom-rule-score').value='10.0'">+10.0 (Suspeito)</button>
                                    <button type="button" class="badge bg-secondary-subtle text-secondary border cursor-pointer" onclick="document.getElementById('custom-rule-score').value='5.0'">+5.0 (Alerta)</button>
                                </div>
                            </div>
                        </div>

                        <div class="row g-3 mb-3">
                            <div class="col-md-6">
                                <label class="form-label small fw-bold text-dark mb-1">Nome / Código da Regra (Identificador Único)</label>
                                <input type="text" class="form-control font-monospace" id="custom-rule-name" placeholder="LOCAL_GOLPE_PEDAGIO" required>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label small fw-bold text-dark mb-1">Descrição Explicativa da Regra</label>
                                <input type="text" class="form-control" id="custom-rule-describe" placeholder="ZRTI - Bloqueio de golpe de falso pedágio" required>
                            </div>
                        </div>

                        <!-- Testador Interativo de Regex Inline -->
                        <div class="p-3 bg-light rounded border">
                            <label class="form-label small fw-bold text-dark mb-1 d-flex align-items-center gap-1">
                                <i class="bi bi-play-circle-fill text-primary"></i> Testador Rápido de Regex em Tempo Real
                            </label>
                            <div class="input-group input-group-sm mb-2">
                                <input type="text" class="form-control" id="custom-rule-test-input" placeholder="Digite uma frase ou cabeçalho para testar contra o padrão acima...">
                                <button type="button" class="btn btn-outline-primary" onclick="testModalRegex()">
                                    <i class="bi bi-play-fill me-1"></i> Testar Regex Agora
                                </button>
                            </div>
                            <div id="custom-rule-test-result" class="small text-muted font-monospace p-2 rounded bg-white border d-none"></div>
                        </div>
                    </div>
                    <div class="modal-footer bg-light p-3">
                        <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancelar</button>
                        <button type="submit" class="btn btn-primary btn-sm px-4">
                            <i class="bi bi-check-circle me-1"></i> Salvar Regra Inteligente
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>"""

if 'id="customSpamRuleModal"' not in content:
    # Insert modal before </body>
    pos_body_end = content.rfind('</body>')
    if pos_body_end != -1:
        content = content[:pos_body_end] + custom_modal_html + "\n\n" + content[pos_body_end:]
        print("Added customSpamRuleModal to index.html successfully!")
    else:
        print("Could not find </body> in index.html")
else:
    print("customSpamRuleModal already exists in index.html")

# 2. Fix the Table Header in #spam-tab-lists for Blacklist/Whitelist
old_table_header = """                                        <thead class="table-light">
                                            <tr>
                                                <th>Tipo de Acesso</th>
                                                <th>Alvo (Domínio / E-mail / IP)</th>
                                                <th>Score Aplicado</th>
                                                <th>Origem</th>
                                                <th>Status</th>
                                                <th class="text-center" style="width: 100px;">Ações</th>
                                            </tr>
                                        </thead>"""

new_table_header = """                                        <thead class="table-light">
                                            <tr>
                                                <th style="width: 50px;" class="text-center">#</th>
                                                <th style="width: 150px;">Tipo de Acesso</th>
                                                <th>Alvo (Domínio / E-mail / Wildcard)</th>
                                                <th style="width: 120px;">Score</th>
                                                <th>Interpretação & Diagnóstico</th>
                                                <th style="width: 110px;">Origem</th>
                                                <th style="width: 90px;" class="text-center">Status</th>
                                                <th style="width: 90px;" class="text-center">Ações</th>
                                            </tr>
                                        </thead>"""

if old_table_header in content:
    content = content.replace(old_table_header, new_table_header)
    print("Updated visual rules table header successfully!")
else:
    print("Could not find exact old_table_header in index.html, searching with regex...")
    pattern_th = r'<thead class="table-light">\s*<tr>\s*<th>Tipo de Acesso</th>.*?<th class="text-center".*?>Ações</th>\s*</tr>\s*</thead>'
    match_th = re.search(pattern_th, content, re.DOTALL)
    if match_th:
        content = content[:match_th.start()] + new_table_header + content[match_th.end():]
        print("Replaced visual rules table header via regex!")
    else:
        print("Could not find table header via regex either.")

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
