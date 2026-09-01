with open('server.ts', 'r', encoding='utf-8') as f:
    text = f.read()

old_parser = """  // Helper parser for Custom Regex Rules (header, score, describe)
  function parseCustomSpamRules(cfContent: string) {
    const lines = cfContent.split("\\n");
    const rulesMap = new Map<string, any>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith("# ==") || line.startsWith("# --")) continue;

      const headerMatch = line.match(/^header\\s+([A-Za-z0-9_]+)\\s+([A-Za-z0-9_\\-]+)\\s*=~\\s*(.+)$/i);
      if (headerMatch) {
        const name = headerMatch[1];
        const target = headerMatch[2];
        const rawPattern = headerMatch[3].trim();
        if (!rulesMap.has(name)) {
          rulesMap.set(name, { id: name, name, target, pattern: rawPattern, score: 5.0, describe: "", enabled: true });
        } else {
          const r = rulesMap.get(name);
          r.target = target;
          r.pattern = rawPattern;
        }
        continue;
      }

      const bodyMatch = line.match(/^body\\s+([A-Za-z0-9_]+)\\s*=~\\s*(.+)$/i);
      if (bodyMatch) {
        const name = bodyMatch[1];
        const rawPattern = bodyMatch[2].trim();
        if (!rulesMap.has(name)) {
          rulesMap.set(name, { id: name, name, target: "Body", pattern: rawPattern, score: 5.0, describe: "", enabled: true });
        } else {
          const r = rulesMap.get(name);
          r.target = "Body";
          r.pattern = rawPattern;
        }
        continue;
      }

      const uriMatch = line.match(/^uri\\s+([A-Za-z0-9_]+)\\s*=~\\s*(.+)$/i);
      if (uriMatch) {
        const name = uriMatch[1];
        const rawPattern = uriMatch[2].trim();
        if (!rulesMap.has(name)) {
          rulesMap.set(name, { id: name, name, target: "URI", pattern: rawPattern, score: 5.0, describe: "", enabled: true });
        } else {
          const r = rulesMap.get(name);
          r.target = "URI";
          r.pattern = rawPattern;
        }
        continue;
      }

      const scoreMatch = line.match(/^score\\s+([A-Za-z0-9_]+)\\s+([0-9\\.\\-]+)/i);
      if (scoreMatch) {
        const name = scoreMatch[1];
        const scoreVal = parseFloat(scoreMatch[2]);
        if (rulesMap.has(name)) {
          rulesMap.get(name).score = scoreVal;
        } else if (name.startsWith("LOCAL_") || name.startsWith("ZRTI_")) {
          rulesMap.set(name, { id: name, name, target: "Header", pattern: "", score: scoreVal, describe: "", enabled: true });
        }
        continue;
      }

      const descMatch = line.match(/^describe\\s+([A-Za-z0-9_]+)\\s+(.+)$/i);
      if (descMatch) {
        const name = descMatch[1];
        const descVal = descMatch[2].trim();
        if (rulesMap.has(name)) {
          rulesMap.get(name).describe = descVal;
        }
        continue;
      }
    }

    return Array.from(rulesMap.values()).map(r => {
      let cat: 'phishing' | 'obfuscation' | 'hijack' | 'custom' = 'custom';
      const nameLower = r.name.toLowerCase();
      const descLower = (r.describe || '').toLowerCase();
      if (nameLower.includes('golpe') || nameLower.includes('pedagio') || nameLower.includes('reclame') || descLower.includes('phishing') || descLower.includes('golpe')) {
        cat = 'phishing';
      } else if (nameLower.includes('quebrado') || nameLower.includes('ofuscado') || descLower.includes('ofuscado') || descLower.includes('charset')) {
        cat = 'obfuscation';
      } else if (nameLower.includes('replyto') || descLower.includes('sequestrado') || descLower.includes('reply-to')) {
        cat = 'hijack';
      }
      return { ...r, category: cat };
    });
  }"""

new_parser = """  // Helper parser for Custom Regex Rules (header, body, uri, score, describe)
  function parseCustomSpamRules(cfContent: string) {
    const lines = cfContent.split("\\n");
    const rulesMap = new Map<string, any>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith("# ==") || line.startsWith("# --")) continue;

      const headerMatch = line.match(/^header\\s+([A-Za-z0-9_]+)\\s+([A-Za-z0-9_\\-]+)\\s*(?:=~)?\\s*(.+)$/i);
      if (headerMatch) {
        const name = headerMatch[1];
        const target = headerMatch[2];
        const rawPattern = headerMatch[3].trim();
        if (!rulesMap.has(name)) {
          rulesMap.set(name, { id: name, name, target, pattern: rawPattern, score: 5.0, describe: "", enabled: true });
        } else {
          const r = rulesMap.get(name);
          r.target = target;
          r.pattern = rawPattern;
        }
        continue;
      }

      const uriMatch = line.match(/^uri\\s+([A-Za-z0-9_]+)\\s*(?:=~)?\\s*(.+)$/i);
      if (uriMatch) {
        const name = uriMatch[1];
        const rawPattern = uriMatch[2].trim();
        if (!rulesMap.has(name)) {
          rulesMap.set(name, { id: name, name, target: "URI / Links", pattern: rawPattern, score: 12.0, describe: "", enabled: true });
        } else {
          const r = rulesMap.get(name);
          r.target = "URI / Links";
          r.pattern = rawPattern;
        }
        continue;
      }

      const bodyMatch = line.match(/^(?:body|rawbody)\\s+([A-Za-z0-9_]+)\\s*(?:=~)?\\s*(.+)$/i);
      if (bodyMatch) {
        const name = bodyMatch[1];
        const rawPattern = bodyMatch[2].trim();
        if (!rulesMap.has(name)) {
          rulesMap.set(name, { id: name, name, target: "Body", pattern: rawPattern, score: 5.0, describe: "", enabled: true });
        } else {
          const r = rulesMap.get(name);
          r.target = "Body";
          r.pattern = rawPattern;
        }
        continue;
      }

      const scoreMatch = line.match(/^score\\s+([A-Za-z0-9_]+)\\s+([0-9\\.\\-]+)/i);
      if (scoreMatch) {
        const name = scoreMatch[1];
        const scoreVal = parseFloat(scoreMatch[2]);
        if (rulesMap.has(name)) {
          rulesMap.get(name).score = scoreVal;
        } else if (name.startsWith("LOCAL_") || name.startsWith("ZRTI_")) {
          rulesMap.set(name, { id: name, name, target: "Header", pattern: "", score: scoreVal, describe: "", enabled: true });
        }
        continue;
      }

      const descMatch = line.match(/^describe\\s+([A-Za-z0-9_]+)\\s+(.+)$/i);
      if (descMatch) {
        const name = descMatch[1];
        const descVal = descMatch[2].trim();
        if (rulesMap.has(name)) {
          rulesMap.get(name).describe = descVal;
        }
        continue;
      }
    }

    return Array.from(rulesMap.values()).map(r => {
      let cat: 'phishing' | 'obfuscation' | 'links' | 'hijack' | 'custom' = 'custom';
      const nameLower = r.name.toLowerCase();
      const descLower = (r.describe || '').toLowerCase();
      const targetLower = (r.target || '').toLowerCase();
      if (nameLower.includes('link') || nameLower.includes('uri') || targetLower.includes('uri') || descLower.includes('link') || descLower.includes('encurtador')) {
        cat = 'links';
      } else if (nameLower.includes('golpe') || nameLower.includes('pedagio') || nameLower.includes('reclame') || nameLower.includes('pix') || nameLower.includes('fatura') || nameLower.includes('docusign') || descLower.includes('phishing') || descLower.includes('golpe') || descLower.includes('boleto')) {
        cat = 'phishing';
      } else if (nameLower.includes('quebrado') || nameLower.includes('ofuscado') || nameLower.includes('caracteres') || descLower.includes('ofuscado') || descLower.includes('charset') || descLower.includes('homografo') || descLower.includes('zero-width')) {
        cat = 'obfuscation';
      } else if (nameLower.includes('replyto') || descLower.includes('sequestrado') || descLower.includes('reply-to')) {
        cat = 'hijack';
      }
      return { ...r, category: cat };
    });
  }"""

if old_parser in text:
    text = text.replace(old_parser, new_parser)
    with open('server.ts', 'w', encoding='utf-8') as f:
        f.write(text)
    print("Updated parseCustomSpamRules in server.ts!")
else:
    print("Could not find exact old_parser in server.ts")
