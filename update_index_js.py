import re

with open('templates/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update renderVisualSpamRulesTable
pos_vis = content.find('function renderVisualSpamRulesTable()')
if pos_vis != -1:
    pos_vis_end = content.find('function deleteVisualSpamRule', pos_vis)
    if pos_vis_end == -1:
        pos_vis_end = content.find('async function deleteVisualSpamRule', pos_vis)
    
    new_render_visual = """function renderVisualSpamRulesTable() {
        const tbody = document.getElementById('visual-rules-table-body');
        if (!tbody) return;
        const searchInput = document.getElementById('search-visual-rules-input') || document.getElementById('search-visual-rules');
        const searchTerm = (searchInput ? searchInput.value : '').toLowerCase().trim();

        // 1. Atualizar KPIs do Topo
        const countAll = currentVisualSpamRules.length;
        const countBlacklist = currentVisualSpamRules.filter(r => r.type === 'blacklist_from').length;
        const countSpam = currentVisualSpamRules.filter(r => r.type === 'spam_from').length;
        const countWhitelist = currentVisualSpamRules.filter(r => r.type === 'whitelist_from').length;
        const activeCount = currentVisualSpamRules.filter(r => r.active !== false).length;

        const elKpiTotal = document.getElementById('kpi-visual-total');
        const elKpiRatio = document.getElementById('kpi-visual-active-ratio');
        const elKpiBl = document.getElementById('kpi-visual-blacklist');
        const elKpiWl = document.getElementById('kpi-visual-whitelist');
        const elKpiSpam = document.getElementById('kpi-visual-spam');

        if (elKpiTotal) elKpiTotal.textContent = countAll;
        if (elKpiRatio) elKpiRatio.textContent = countAll > 0 ? `${Math.round((activeCount / countAll) * 100)}% ativas` : '100% ativas';
        if (elKpiBl) elKpiBl.textContent = countBlacklist;
        if (elKpiWl) elKpiWl.textContent = countWhitelist;
        if (elKpiSpam) elKpiSpam.textContent = countSpam;

        const bAll = document.getElementById('badge-spam-count-all');
        const bBlacklist = document.getElementById('badge-spam-count-blacklist');
        const bSpam = document.getElementById('badge-spam-count-spam');
        const bWhitelist = document.getElementById('badge-spam-count-whitelist');
        if (bAll) bAll.textContent = countAll;
        if (bBlacklist) bBlacklist.textContent = countBlacklist;
        if (bSpam) bSpam.textContent = countSpam;
        if (bWhitelist) bWhitelist.textContent = countWhitelist;

        // 2. Filtrar por Categoria ou Duplicatas
        let filtered = currentVisualSpamRules;
        if (currentSpamCategoryFilter === 'duplicates') {
            const targetMap = {};
            currentVisualSpamRules.forEach(r => {
                const norm = (r.value || '').replace(/^\\*@/, '@').replace(/^\\*/, '').toLowerCase();
                targetMap[norm] = (targetMap[norm] || 0) + 1;
            });
            filtered = filtered.filter(r => {
                const norm = (r.value || '').replace(/^\\*@/, '@').replace(/^\\*/, '').toLowerCase();
                return targetMap[norm] > 1;
            });
        } else if (currentSpamCategoryFilter !== 'all') {
            filtered = filtered.filter(r => r.type === currentSpamCategoryFilter);
        }

        // 3. Filtrar por Termo de Busca
        if (searchTerm) {
            filtered = filtered.filter(r => 
                (r.value || '').toLowerCase().includes(searchTerm) || 
                (r.raw || '').toLowerCase().includes(searchTerm) ||
                (r.action_label || '').toLowerCase().includes(searchTerm) ||
                (r.reason || '').toLowerCase().includes(searchTerm) ||
                (r.interpretation || '').toLowerCase().includes(searchTerm) ||
                (r.origin || '').toLowerCase().includes(searchTerm)
            );
        }

        if (filtered.length === 0) {
            let msg = 'Nenhuma regra encontrada com os filtros atuais.';
            if (currentSpamCategoryFilter === 'blacklist_from') msg = 'Nenhum bloqueio (Blacklist) cadastrado.';
            else if (currentSpamCategoryFilter === 'spam_from') msg = 'Nenhuma regra de pontuação SPAM cadastrada.';
            else if (currentSpamCategoryFilter === 'whitelist_from') msg = 'Nenhuma regra em White List cadastrada.';
            else if (currentSpamCategoryFilter === 'duplicates') msg = 'Nenhuma duplicidade ou conflito encontrado! Todas as regras estão otimizadas.';
            
            if (searchTerm) msg = `Nenhuma regra encontrada para a busca "${searchTerm}".`;
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4 small font-monospace">${msg}</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map((r, index) => {
            const ruleNum = r.rule_number || r.id || (index + 1);
            let badgeHtml = '';
            let scoreBadge = '';
            if (r.type === 'blacklist_from') {
                badgeHtml = `<span class="badge bg-danger-subtle text-danger border border-danger-subtle px-2.5 py-1 font-monospace"><i class="bi bi-shield-x me-1"></i> Bloqueado</span>`;
                scoreBadge = `<span class="badge bg-danger-subtle text-danger font-monospace px-2 py-1">+100.0</span>`;
            } else if (r.type === 'spam_from') {
                badgeHtml = `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2.5 py-1 font-monospace"><i class="bi bi-exclamation-triangle-fill text-warning me-1"></i> SPAM</span>`;
                scoreBadge = `<span class="badge bg-warning-subtle text-dark font-monospace px-2 py-1">+20.0</span>`;
            } else {
                badgeHtml = `<span class="badge bg-success-subtle text-success border border-success-subtle px-2.5 py-1 font-monospace"><i class="bi bi-shield-check me-1"></i> White List</span>`;
                scoreBadge = `<span class="badge bg-success-subtle text-success font-monospace px-2 py-1">-100.0</span>`;
            }

            const val = r.value || r.target_value || '';
            const targetType = r.target_type || (val.includes('@') && !val.startsWith('*@') ? 'email' : 'domain');
            const targetTypeBadge = targetType === 'email' 
                ? `<span class="badge bg-info-subtle text-info border border-info-subtle small px-1.5 py-0.5 font-monospace" style="font-size: 10px;">E-MAIL</span>`
                : `<span class="badge bg-secondary-subtle text-secondary border small px-1.5 py-0.5 font-monospace" style="font-size: 10px;">DOMÍNIO</span>`;

            const isActive = r.active !== false;
            const toggleSwitch = `
                <div class="form-check form-switch d-flex justify-content-center p-0 m-0">
                    <input class="form-check-input ms-0" type="checkbox" role="switch" ${isActive ? 'checked' : ''} onchange="toggleVisualRuleActive('${encodeURIComponent(r.raw || '')}', ${isActive})" title="${isActive ? 'Desativar Regra' : 'Ativar Regra'}">
                </div>
            `;

            const originBadge = r.origin === 'incident' 
                ? `<span class="badge bg-danger-subtle text-danger font-monospace" style="font-size: 10px;"><i class="bi bi-shield-exclamation me-1"></i>Incidente</span>`
                : r.origin === 'spam_analysis'
                ? `<span class="badge bg-warning-subtle text-dark font-monospace" style="font-size: 10px;"><i class="bi bi-radar me-1"></i>Análise SPAM</span>`
                : `<span class="badge bg-light text-secondary border font-monospace" style="font-size: 10px;">Manual</span>`;

            const interpretationText = r.interpretation || (
                r.type === 'blacklist_from' ? `Bloqueia e descarta mensagens enviadas por <strong>${val}</strong>` :
                r.type === 'whitelist_from' ? `Permite e isenta de SPAM mensagens enviadas por <strong>${val}</strong>` :
                `Pontua +20 pontos de SPAM para mensagens enviadas por <strong>${val}</strong>`
            );

            return `
                <tr class="${!isActive ? 'opacity-50 bg-light' : ''}">
                    <td class="text-center text-muted font-monospace small">#${ruleNum}</td>
                    <td>${badgeHtml}</td>
                    <td>
                        <div class="d-flex align-items-center gap-1.5">
                            <strong class="font-monospace text-dark fs-6">${val}</strong>
                            ${targetTypeBadge}
                        </div>
                    </td>
                    <td>${scoreBadge}</td>
                    <td><div class="small text-secondary">${interpretationText}</div></td>
                    <td>${originBadge}</td>
                    <td class="text-center">${toggleSwitch}</td>
                    <td class="text-center">
                        <div class="d-inline-flex align-items-center gap-1">
                            <button class="btn btn-sm btn-outline-danger p-1 border-0" onclick="deleteVisualSpamRule('${encodeURIComponent(r.raw || '')}')" title="Excluir Regra">
                                <i class="bi bi-trash fs-6"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }
    
    """
    content = content[:pos_vis] + new_render_visual + content[pos_vis_end:]
    print("Replaced renderVisualSpamRulesTable with pristine 8-column layout!")

# 2. Update renderCustomSpamRulesTable and add helper functions (applySpamHeuristicPreset, testModalRegex)
pos_custom = content.find('function renderCustomSpamRulesTable()')
if pos_custom != -1:
    pos_custom_end = content.find('function openNewCustomSpamRuleModal', pos_custom)
    if pos_custom_end != -1:
        new_render_custom = """function renderCustomSpamRulesTable() {
        const tbody = document.getElementById('custom-rules-table-body');
        if (!tbody) return;
        const searchInput = document.getElementById('search-heuristic-rules-input');
        const searchTerm = (searchInput ? searchInput.value : '').toLowerCase().trim();

        // 1. Atualizar contadores e KPIs
        const countAll = currentCustomSpamRules.length;
        const countPhishing = currentCustomSpamRules.filter(r => (r.category === 'phishing') || (r.name || '').includes('GOLPE') || (r.name || '').includes('PEDAGIO') || (r.name || '').includes('RECLAME') || (r.describe || '').toLowerCase().includes('phishing')).length;
        const countLinks = currentCustomSpamRules.filter(r => (r.category === 'links') || (r.target === 'URI / Links') || (r.target === 'URI') || (r.name || '').includes('LINK') || (r.name || '').includes('URI')).length;
        const countObfuscation = currentCustomSpamRules.filter(r => (r.category === 'obfuscation') || (r.name || '').includes('OFUSCADO') || (r.name || '').includes('QUEBRADO') || (r.name || '').includes('CARACTERES')).length;

        const bAll = document.getElementById('badge-heuristic-all');
        const bCustomCount = document.getElementById('badge-custom-rules-count');
        const elKpiPhishing = document.getElementById('kpi-custom-phishing');
        const elKpiLinks = document.getElementById('kpi-custom-links');
        const elKpiObfuscation = document.getElementById('kpi-custom-obfuscation');

        if (bAll) bAll.textContent = countAll;
        if (bCustomCount) bCustomCount.textContent = countAll;
        if (elKpiPhishing) elKpiPhishing.textContent = countPhishing;
        if (elKpiLinks) elKpiLinks.textContent = countLinks;
        if (elKpiObfuscation) elKpiObfuscation.textContent = countObfuscation;

        // 2. Filtrar por categoria
        let filtered = currentCustomSpamRules;
        if (currentHeuristicCategory !== 'all') {
            filtered = filtered.filter(r => {
                const cat = (r.category || '').toLowerCase();
                const name = (r.name || '').toLowerCase();
                const desc = (r.describe || '').toLowerCase();
                const target = (r.target || '').toLowerCase();
                if (currentHeuristicCategory === 'phishing') {
                    return cat === 'phishing' || name.includes('pedagio') || name.includes('reclame') || name.includes('golpe') || name.includes('pix') || name.includes('fatura') || name.includes('docusign') || desc.includes('phishing') || desc.includes('golpe');
                } else if (currentHeuristicCategory === 'links') {
                    return cat === 'links' || target.includes('uri') || name.includes('link') || name.includes('uri') || desc.includes('link') || desc.includes('encurtador');
                } else if (currentHeuristicCategory === 'obfuscation') {
                    return cat === 'obfuscation' || name.includes('ofuscado') || name.includes('quebrado') || name.includes('caracteres') || desc.includes('ofuscado') || desc.includes('charset') || desc.includes('homografo') || desc.includes('zero-width');
                } else if (currentHeuristicCategory === 'hijack') {
                    return cat === 'hijack' || name.includes('replyto') || desc.includes('sequestrado') || desc.includes('reply-to');
                }
                return true;
            });
        }

        // 3. Filtrar por busca textual
        if (searchTerm) {
            filtered = filtered.filter(r => 
                (r.name || '').toLowerCase().includes(searchTerm) ||
                (r.pattern || '').toLowerCase().includes(searchTerm) ||
                (r.describe || '').toLowerCase().includes(searchTerm) ||
                (r.target || '').toLowerCase().includes(searchTerm)
            );
        }

        if (filtered.length === 0) {
            let msg = 'Nenhuma regra personalizada encontrada nesta categoria.';
            if (searchTerm) msg = `Nenhuma regra encontrada para a busca "${searchTerm}".`;
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4 small font-monospace">${msg}</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(r => {
            const scoreVal = parseFloat(r.score || 15.0);
            const scoreBadgeClass = scoreVal >= 12.0 ? 'bg-danger-subtle text-danger border border-danger-subtle' : scoreVal >= 5.0 ? 'bg-warning-subtle text-warning-emphasis border border-warning-subtle' : 'bg-secondary-subtle text-secondary';
            
            let targetBadge = `<span class="badge bg-light text-dark border font-monospace px-2 py-1">${r.target || 'Subject'}</span>`;
            if (r.target === 'Subject') targetBadge = `<span class="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace px-2 py-1"><i class="bi bi-chat-left-text me-1"></i> Assunto</span>`;
            else if (r.target === 'Body') targetBadge = `<span class="badge bg-warning-subtle text-dark border border-warning-subtle font-monospace px-2 py-1"><i class="bi bi-file-text me-1"></i> Corpo (Body)</span>`;
            else if (r.target === 'From') targetBadge = `<span class="badge bg-danger-subtle text-danger border border-danger-subtle font-monospace px-2 py-1"><i class="bi bi-person me-1"></i> Remetente</span>`;
            else if (r.target === 'Reply-To') targetBadge = `<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle font-monospace px-2 py-1"><i class="bi bi-reply me-1"></i> Reply-To</span>`;
            else if (r.target === 'URI / Links' || r.target === 'URI') targetBadge = `<span class="badge bg-info-subtle text-info border border-info-subtle font-monospace px-2 py-1"><i class="bi bi-link-45deg me-1"></i> Link / URI</span>`;

            return `
                <tr>
                    <td>
                        <div class="fw-bold text-dark font-monospace fs-6">${r.name}</div>
                        <small class="text-muted d-flex align-items-center gap-1"><i class="bi bi-shield-check text-success"></i> SpamAssassin local.cf</small>
                    </td>
                    <td>${targetBadge}</td>
                    <td>
                        <code class="d-inline-block text-break font-monospace p-1.5 bg-light rounded border small text-dark">${r.pattern || '-'}</code>
                    </td>
                    <td class="text-center">
                        <span class="badge ${scoreBadgeClass} font-monospace fs-6 px-2.5 py-1">+${scoreVal.toFixed(1)}</span>
                    </td>
                    <td>
                        <span class="small text-secondary">${r.describe || 'Regra personalizada de inteligência antispam local.'}</span>
                    </td>
                    <td class="text-center">
                        <div class="d-inline-flex align-items-center gap-1">
                            <button class="btn btn-sm btn-outline-primary p-1 border-0" onclick="openTestCustomRuleDirectly('${r.name}')" title="Testar Regex">
                                <i class="bi bi-play-circle fs-6"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-warning text-dark p-1 border-0" onclick="openEditCustomSpamRuleModal('${r.name}')" title="Editar Regra">
                                <i class="bi bi-pencil-square fs-6"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger p-1 border-0" onclick="deleteCustomSpamRule('${r.name}')" title="Excluir Regra">
                                <i class="bi bi-trash fs-6"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }
    
    """
        content = content[:pos_custom] + new_render_custom + content[pos_custom_end:]
        print("Updated renderCustomSpamRulesTable successfully!")

# 3. Add Preset and Regex tester functions
helper_js = """
    // Presets Rápidos de Inteligência AntiSPAM
    function applySpamHeuristicPreset(presetKey) {
        const presets = {
            'pedagio': {
                name: 'LOCAL_GOLPE_PEDAGIO',
                target: 'Subject',
                pattern: '/ped.gios?|vi.ria|rodovi.rio|pend.ncia/i',
                score: '15.0',
                describe: 'ZRTI - Phishing de Notificacao de Pedagio / Rodovia'
            },
            'remetente_falso': {
                name: 'LOCAL_GOLPE_REMETENTE',
                target: 'From',
                pattern: '/Regulariza..o|Pend.ncias|Cobran.a|ReclameAqui/i',
                score: '15.0',
                describe: 'ZRTI - Phishing Remetente Falso Reclame Aqui / Cobranca'
            },
            'links_suspeitos': {
                name: 'LOCAL_LINK_SUSPEITO',
                target: 'URI',
                pattern: '/(bit\\.ly|tinyurl|is\\.gd|cutt\\.ly|t\\.co|wa\\.me|goo\\.gl)\\/[a-zA-Z0-9]+/i',
                score: '12.0',
                describe: 'ZRTI - Link Encurtador ou Redirecionamento Suspeito no Corpo'
            },
            'link_ip_direto': {
                name: 'LOCAL_LINK_IP_DIRETO',
                target: 'URI',
                pattern: '/https?:\\/\\/\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}/i',
                score: '14.0',
                describe: 'ZRTI - Link com Endereco IP Direto no E-mail'
            },
            'caracteres_estranhos': {
                name: 'LOCAL_CARACTERES_ESTRANHOS',
                target: 'Subject',
                pattern: '/[\\u200B-\\u200D\\uFEFF]|[\\u0400-\\u04FF].*[\\u0041-\\u007A]/',
                score: '10.0',
                describe: 'ZRTI - Caracteres estranhos, zero-width ou homografos no assunto'
            },
            'assunto_quebrado': {
                name: 'LOCAL_ASSUNTO_QUEBRADO',
                target: 'Subject',
                pattern: '/\\?{2,}/',
                score: '5.0',
                describe: 'ZRTI - Assunto com erro de codificacao (??)'
            },
            'pix_fatura': {
                name: 'LOCAL_GOLPE_PIX_FATURA',
                target: 'Subject',
                pattern: '/comprovante.*pix|fatura.*vencida|boleto.*atualizado|duplicata.*vencendo/i',
                score: '12.0',
                describe: 'ZRTI - Phishing de Boleto Falso e Comprovante PIX'
            },
            'replyto_sequestrado': {
                name: 'LOCAL_GOLPE_REPLYTO',
                target: 'Reply-To',
                pattern: '/vidracariarubi\\.com\\.br/i',
                score: '15.0',
                describe: 'ZRTI - Bloqueio de Dominio Sequestrado em Reply-To'
            }
        };

        const p = presets[presetKey];
        if (!p) return;

        document.getElementById('custom-rule-old-name').value = '';
        document.getElementById('custom-rule-name').value = p.name;
        document.getElementById('custom-rule-name').readOnly = false;
        document.getElementById('custom-rule-score').value = p.score;
        document.getElementById('custom-rule-target').value = p.target;
        document.getElementById('custom-rule-describe').value = p.describe;
        document.getElementById('custom-rule-pattern').value = p.pattern;
        document.getElementById('custom-rule-friendly-keywords').value = '';
        setCustomRuleModalMode('regex');

        const modalEl = document.getElementById('customSpamRuleModal');
        if (modalEl) {
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
        }
    }

    function openTestCustomRuleDirectly(ruleName) {
        const rule = currentCustomSpamRules.find(r => r.name === ruleName);
        if (!rule) return;
        openEditCustomSpamRuleModal(ruleName);
    }

    function testModalRegex() {
        const patternVal = (document.getElementById('custom-rule-pattern').value || '').trim();
        const testInput = (document.getElementById('custom-rule-test-input').value || '').trim();
        const resultDiv = document.getElementById('custom-rule-test-result');
        const scoreVal = document.getElementById('custom-rule-score').value || '15.0';

        if (!patternVal) {
            showAlert('Defina um padrão Regex primeiro.', 'warning');
            return;
        }
        if (!testInput) {
            showAlert('Digite um texto de teste no campo abaixo.', 'warning');
            return;
        }

        try {
            let regex;
            if (patternVal.startsWith('/')) {
                const lastSlash = patternVal.lastIndexOf('/');
                const patternBody = patternVal.slice(1, lastSlash);
                const flags = patternVal.slice(lastSlash + 1);
                regex = new RegExp(patternBody, flags);
            } else {
                regex = new RegExp(patternVal, 'i');
            }

            const matched = regex.test(testInput);
            resultDiv.classList.remove('d-none');

            if (matched) {
                resultDiv.innerHTML = `<div class="text-danger fw-bold"><i class="bi bi-shield-x me-1"></i> MATCH CONFIRMADO! O padrão identificou SPAM no texto. (Impacto: +${scoreVal} pts)</div>`;
            } else {
                resultDiv.innerHTML = `<div class="text-success"><i class="bi bi-shield-check me-1"></i> NENHUMA CORRESPONDÊNCIA. O texto passou limpo pelo padrão.</div>`;
            }
        } catch (e) {
            resultDiv.classList.remove('d-none');
            resultDiv.innerHTML = `<div class="text-danger"><i class="bi bi-exclamation-triangle me-1"></i> Erro de Sintaxe no Regex: ${e.message}</div>`;
        }
    }
"""

if 'function applySpamHeuristicPreset' not in content:
    pos_save = content.find('async function saveCustomSpamRule')
    if pos_save != -1:
        content = content[:pos_save] + helper_js + "\n" + content[pos_save:]
        print("Added applySpamHeuristicPreset, openTestCustomRuleDirectly and testModalRegex!")
    else:
        print("Could not find saveCustomSpamRule to insert helpers before.")

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
