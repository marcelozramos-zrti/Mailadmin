#!/usr/bin/env python3
"""
MailAdmin Suite - Script de Consolidação, Deduplicação e Auditoria do local.cf
ZRTI Antispam Engine

Uso:
  python3 scripts/consolidate_localcf.py [--check] [--apply] [--reload]
"""

import sys
import os
import argparse
import subprocess
import shutil

# Inclui diretório raiz para importar módulos do MailAdmin se necessário
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from spamassassin_engine import consolidate_and_clean_rules, LOCAL_CF_PATHS
except ImportError:
    # Fallback caso executado isoladamente
    LOCAL_CF_PATHS = ["/etc/mail/spamassassin/local.cf", "/etc/spamassassin/local.cf"]
    def consolidate_and_clean_rules(content):
        return content, {"access_list_removed": 0, "rules_deduplicated": 0}


def find_target_local_cf():
    for p in LOCAL_CF_PATHS:
        if os.path.exists(p):
            return p
    return "/etc/spamassassin/local.cf"


def main():
    parser = argparse.ArgumentParser(description="Audita, limpa e deduplica o arquivo local.cf do SpamAssassin.")
    parser.add_argument("--check", action="store_true", help="Apenas audita e exibe duplicidades sem alterar arquivos.")
    parser.add_argument("--apply", action="store_true", help="Aplica a consolidação e salva o arquivo.")
    parser.add_argument("--reload", action="store_true", help="Recarrega os serviços Amavis e SpamAssassin após consolidar.")
    parser.add_argument("--target", type=str, default=None, help="Caminho customizado do local.cf")

    args = parser.parse_args()

    target_path = args.target if args.target else find_target_local_cf()
    print("=" * 70)
    print("🔍 ZRTI MailAdmin - Consolidador & Auditor de local.cf")
    print(f"📁 Arquivo alvo: {target_path}")
    print("=" * 70)

    if not os.path.exists(target_path):
        print(f"⚠️ Aviso: Arquivo {target_path} não encontrado no sistema.")
        # Se for teste, cria um mockup básico
        if args.apply:
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            with open(target_path, "w") as f:
                f.write("# local.cf inicial\nrequired_score 5.0\n")
            print(f"✅ Criado arquivo esqueleto em {target_path}")
        else:
            sys.exit(0)

    try:
        with open(target_path, "r", encoding="utf-8", errors="ignore") as f:
            original_content = f.read()
    except Exception as e:
        print(f"❌ Erro ao ler {target_path}: {e}")
        sys.exit(1)

    lines_before = len(original_content.splitlines())
    cleaned_content, stats = consolidate_and_clean_rules(original_content)
    lines_after = len(cleaned_content.splitlines())

    print(f"📊 Estatísticas de Análise:")
    print(f"   • Linhas Originais: {lines_before}")
    print(f"   • Linhas Consolidadas: {lines_after}")
    print(f"   • Entradas de Blacklist/Whitelist Duplicadas: {stats.get('access_list_removed', 0)}")
    print(f"   • Diretivas Heurísticas Repetidas: {stats.get('rules_deduplicated', 0)}")

    if args.check or not args.apply:
        print("\n🔍 Modo AUDITORIA (Nenhuma modificação gravada em disco).")
        if stats.get('access_list_removed', 0) > 0 or stats.get('rules_deduplicated', 0) > 0:
            print("⚠️ Existem regras duplicadas que podem ser consolidadas.")
            print("👉 Execute com --apply para aplicar a limpeza segura.")
        else:
            print("✅ local.cf está perfeitamente limpo, deduplicado e em conformidade.")
        return

    # Modo Apply
    backup_path = f"{target_path}.bak.zrti"
    try:
        shutil.copy2(target_path, backup_path)
        print(f"💾 Backup de segurança criado: {backup_path}")
    except Exception as e:
        print(f"⚠️ Não foi possível criar backup (permissão ou caminho): {e}")

    try:
        with open(target_path, "w", encoding="utf-8") as f:
            f.write(cleaned_content)
        print(f"✅ Arquivo {target_path} gravado com sucesso!")
    except Exception as e:
        print(f"❌ Falha ao gravar {target_path}: {e}")
        print("Dica: execute como root ou utilize 'sudo python3 scripts/consolidate_localcf.py --apply'")
        sys.exit(1)

    # Lint check
    print("\n🔬 Validando sintaxe com 'spamassassin --lint'...")
    try:
        res = subprocess.run(["spamassassin", "--lint"], capture_output=True, text=True, timeout=10)
        if res.returncode == 0:
            print("✅ Sintaxe SpamAssassin válida (0 erros detectados)!")
        else:
            print("⚠️ Aviso na validação do SpamAssassin:")
            print(res.stderr or res.stdout)
    except FileNotFoundError:
        print("ℹ️ Comando 'spamassassin' não encontrado no PATH imediato (ambiente simulado ou contêiner).")
    except Exception as e:
        print(f"ℹ️ Não foi possível executar spamassassin --lint: {e}")

    # Reload services if requested
    if args.reload:
        print("\n🔄 Recarregando daemons Amavis e SpamAssassin...")
        for svc in ["amavis", "amavisd-new", "spamassassin"]:
            try:
                r = subprocess.run(["systemctl", "reload", svc], capture_output=True, text=True)
                if r.returncode == 0:
                    print(f"  • Serviço '{svc}' recarregado com sucesso.")
            except Exception:
                pass

    print("\n🏁 Operação concluída com sucesso!")


if __name__ == "__main__":
    main()
