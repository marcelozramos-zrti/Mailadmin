with open('blueprints/services_bp.py', 'r', encoding='utf-8') as f:
    text = f.read()

old_func = """def parse_custom_spam_rules_py(cf_content):
    lines = cf_content.splitlines()
    rules_map = {}
    for line in lines:
        clean = line.strip()
        if not clean or clean.startswith('# ==') or clean.startswith('# --'):
            continue
        header_match = re.match(r'^header\s+([A-Za-z0-9_]+)\s+([A-Za-z0-9_\-]+)\s*=~\s*(.+)$', clean, re.IGNORECASE)
        if header_match:
            name, target, raw_pattern = header_match.group(1), header_match.group(2), header_match.group(3).strip()
            if name not in rules_map:
                rules_map[name] = {'id': name, 'name': name, 'target': target, 'pattern': raw_pattern, 'score': 5.0, 'describe': '', 'enabled': True}
            else:
                rules_map[name]['target'] = target
                rules_map[name]['pattern'] = raw_pattern
            continue
        body_match = re.match(r'^body\s+([A-Za-z0-9_]+)\s*=~\s*(.+)$', clean, re.IGNORECASE)
        if body_match:
            name, raw_pattern = body_match.group(1), body_match.group(2).strip()
            if name not in rules_map:
                rules_map[name] = {'id': name, 'name': name, 'target': 'Body', 'pattern': raw_pattern, 'score': 5.0, 'describe': '', 'enabled': True}
            else:
                rules_map[name]['target'] = 'Body'
                rules_map[name]['pattern'] = raw_pattern
            continue
        score_match = re.match(r'^score\s+([A-Za-z0-9_]+)\s+([0-9\.\-]+)', clean, re.IGNORECASE)
        if score_match:
            name = score_match.group(1)
            score_val = float(score_match.group(2))
            if name in rules_map:
                rules_map[name]['score'] = score_val
            elif name.startswith('LOCAL_') or name.startswith('ZRTI_'):
                rules_map[name] = {'id': name, 'name': name, 'target': 'Header', 'pattern': '', 'score': score_val, 'describe': '', 'enabled': True}
            continue
        desc_match = re.match(r'^describe\s+([A-Za-z0-9_]+)\s+(.+)$', clean, re.IGNORECASE)
        if desc_match:
            name, desc_val = desc_match.group(1), desc_match.group(2).strip()
            if name in rules_map:
                rules_map[name]['describe'] = desc_val
            continue
    results = []
    for r in rules_map.values():
        cat = 'custom'
        name_lower = r['name'].lower()
        desc_lower = (r.get('describe') or '').lower()
        if 'golpe' in name_lower or 'pedagio' in name_lower or 'reclame' in name_lower or 'phishing' in desc_lower or 'golpe' in desc_lower:
            cat = 'phishing'
        elif 'quebrado' in name_lower or 'ofuscado' in name_lower or 'ofuscado' in desc_lower or 'charset' in desc_lower:
            cat = 'obfuscation'
        elif 'replyto' in name_lower or 'sequestrado' in desc_lower or 'reply-to' in desc_lower:
            cat = 'hijack'
        r['category'] = cat
        results.append(r)
    return results"""

new_func = """def parse_custom_spam_rules_py(cf_content):
    lines = cf_content.splitlines()
    rules_map = {}
    for line in lines:
        clean = line.strip()
        if not clean or clean.startswith('# ==') or clean.startswith('# --'):
            continue
        header_match = re.match(r'^header\s+([A-Za-z0-9_]+)\s+([A-Za-z0-9_\-]+)\s*(?:=~)?\s*(.+)$', clean, re.IGNORECASE)
        if header_match:
            name, target, raw_pattern = header_match.group(1), header_match.group(2), header_match.group(3).strip()
            if name not in rules_map:
                rules_map[name] = {'id': name, 'name': name, 'target': target, 'pattern': raw_pattern, 'score': 5.0, 'describe': '', 'enabled': True}
            else:
                rules_map[name]['target'] = target
                rules_map[name]['pattern'] = raw_pattern
            continue
        uri_match = re.match(r'^uri\s+([A-Za-z0-9_]+)\s*(?:=~)?\s*(.+)$', clean, re.IGNORECASE)
        if uri_match:
            name, raw_pattern = uri_match.group(1), uri_match.group(2).strip()
            if name not in rules_map:
                rules_map[name] = {'id': name, 'name': name, 'target': 'URI / Links', 'pattern': raw_pattern, 'score': 12.0, 'describe': '', 'enabled': True}
            else:
                rules_map[name]['target'] = 'URI / Links'
                rules_map[name]['pattern'] = raw_pattern
            continue
        body_match = re.match(r'^(?:body|rawbody)\s+([A-Za-z0-9_]+)\s*(?:=~)?\s*(.+)$', clean, re.IGNORECASE)
        if body_match:
            name, raw_pattern = body_match.group(1), body_match.group(2).strip()
            if name not in rules_map:
                rules_map[name] = {'id': name, 'name': name, 'target': 'Body', 'pattern': raw_pattern, 'score': 5.0, 'describe': '', 'enabled': True}
            else:
                rules_map[name]['target'] = 'Body'
                rules_map[name]['pattern'] = raw_pattern
            continue
        score_match = re.match(r'^score\s+([A-Za-z0-9_]+)\s+([0-9\.\-]+)', clean, re.IGNORECASE)
        if score_match:
            name = score_match.group(1)
            score_val = float(score_match.group(2))
            if name in rules_map:
                rules_map[name]['score'] = score_val
            elif name.startswith('LOCAL_') or name.startswith('ZRTI_'):
                rules_map[name] = {'id': name, 'name': name, 'target': 'Header', 'pattern': '', 'score': score_val, 'describe': '', 'enabled': True}
            continue
        desc_match = re.match(r'^describe\s+([A-Za-z0-9_]+)\s+(.+)$', clean, re.IGNORECASE)
        if desc_match:
            name, desc_val = desc_match.group(1), desc_match.group(2).strip()
            if name in rules_map:
                rules_map[name]['describe'] = desc_val
            continue
    results = []
    for r in rules_map.values():
        cat = 'custom'
        name_lower = r['name'].lower()
        desc_lower = (r.get('describe') or '').lower()
        target_lower = (r.get('target') or '').lower()
        if 'link' in name_lower or 'uri' in name_lower or 'uri' in target_lower or 'link' in desc_lower or 'encurtador' in desc_lower:
            cat = 'links'
        elif 'golpe' in name_lower or 'pedagio' in name_lower or 'reclame' in name_lower or 'pix' in name_lower or 'fatura' in name_lower or 'docusign' in name_lower or 'phishing' in desc_lower or 'golpe' in desc_lower or 'boleto' in desc_lower:
            cat = 'phishing'
        elif 'quebrado' in name_lower or 'ofuscado' in name_lower or 'caracteres' in name_lower or 'ofuscado' in desc_lower or 'charset' in desc_lower or 'homografo' in desc_lower or 'zero-width' in desc_lower:
            cat = 'obfuscation'
        elif 'replyto' in name_lower or 'sequestrado' in desc_lower or 'reply-to' in desc_lower:
            cat = 'hijack'
        r['category'] = cat
        results.append(r)
    return results"""

if old_func in text:
    text = text.replace(old_func, new_func)
    with open('blueprints/services_bp.py', 'w', encoding='utf-8') as f:
        f.write(text)
    print("Updated blueprints/services_bp.py parse_custom_spam_rules_py successfully!")
else:
    print("Could not find exact old_func in blueprints/services_bp.py")
