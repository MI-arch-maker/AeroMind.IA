#!/usr/bin/env python3
"""Audit initial i18n AeroMind.

Heuristic audit: inventories human-readable literals in authored frontend/backend
source, compares the current FR/EN dictionary keys, and reports likely unused keys.
It intentionally reports findings rather than modifying source code.
"""
from __future__ import annotations
import argparse, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend" / "client" / "src"
BACKEND = ROOT / "web"
SKIP = {"node_modules", "dist", ".git", "coverage"}
EXTS = {".ts", ".tsx", ".js", ".jsx", ".py"}
IDENT = re.compile(r"^[A-Za-z_$][\w$.-]*$")
# Human text candidates: at least a letter and a space, punctuation, or accented char.
HUMAN = re.compile(r"(?:[À-ÿ]|\s|[.!?,:;/%·’'\-])")
STRING = re.compile(r'''(?P<q>['\"])(?P<v>(?:\\.|(?!\1).){2,})(?P=q)''')
JSX_TEXT = re.compile(r">\s*([^<{][^<{]*[A-Za-zÀ-ÿ][^<{]*)\s*<")

def files():
    for base in (FRONT, BACKEND):
        if not base.exists(): continue
        for p in sorted(base.rglob("*")):
            if p.suffix in EXTS and not any(part in SKIP for part in p.parts):
                yield p

def clean(v):
    return v.replace(r"\'", "'").replace(r'\"', '"').replace(r"\\", "\\")

def likely(v):
    v = v.strip()
    if len(v) < 3 or IDENT.fullmatch(v): return False
    if v.startswith(("http", "data:", "application/", "text/", "./", "../", "--")): return False
    if re.fullmatch(r"[A-Fa-f0-9]{6,}", v): return False
    if not HUMAN.search(v): return False
    if re.fullmatch(r"[A-Za-z0-9_$.-]+", v) and not any(c in v for c in "_- "): return False
    return True

def catalog_keys():
    json_catalogues = {language: FRONT / "lib" / f"{language}.json" for language in ("fr", "en")}
    if all(path.exists() for path in json_catalogues.values()):
        return tuple(sorted(json.loads(path.read_text(encoding="utf8")).keys()) for path in json_catalogues.values())
    p = FRONT / "lib" / "language.ts"
    if not p.exists(): return {}, {}
    text = p.read_text(encoding="utf8")
    chunks = re.split(r"\n\s+(?:en|fr):\s*\{", text)
    out = {}
    for lang, chunk in zip(("fr", "en"), chunks[1:3]):
        keys=[]
        # Object keys are quoted or simple identifiers followed by colon.
        for m in re.finditer(r"(?:^|\n)\s*(?:([A-Za-z_$][\w$]*)|(['\"])(.*?)\2)\s*:", chunk):
            key = m.group(1) or m.group(3)
            if key not in {"fr", "en"}: keys.append(key)
        out[lang] = sorted(set(keys))
    return out.get("fr", []), out.get("en", [])

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--json", action="store_true"); args=ap.parse_args()
    findings=[]
    for p in files():
        rel=p.relative_to(ROOT).as_posix()
        text=p.read_text(encoding="utf8", errors="replace")
        seen=set()
        for m in STRING.finditer(text):
            v=clean(m.group("v")).strip()
            if likely(v) and v not in seen:
                line=text.count("\n",0,m.start())+1; seen.add(v)
                findings.append({"file":rel,"line":line,"text":v,"kind":"string_literal"})
        for m in JSX_TEXT.finditer(text):
            v=" ".join(m.group(1).split())
            if likely(v) and v not in seen:
                line=text.count("\n",0,m.start())+1; seen.add(v)
                findings.append({"file":rel,"line":line,"text":v,"kind":"jsx_text"})
    fr,en=catalog_keys(); sf,se=set(fr),set(en)
    report={
      "root":str(ROOT), "mode":"initial_pre_correction_audit",
      "files_scanned":sum(1 for _ in files()),
      "hardcoded_candidates":findings,
      "hardcoded_candidate_count":len(findings),
      "catalogue":{"fr_keys":len(fr),"en_keys":len(en),"fr_only":sorted(sf-se),"en_only":sorted(se-sf)},
      "declared_keys_never_seen_as_source_text":{"fr_only_unused":sorted(k for k in sf if not any(k==x["text"] for x in findings)),"en_only_unused":sorted(k for k in se if not any(k==x["text"] for x in findings))},
      "note":"This is a conservative static audit; dynamic concatenation and generated content are reported for manual review rather than silently treated as translated."
    }
    if args.json: print(json.dumps(report,ensure_ascii=False,indent=2)); return
    print("AEROMIND I18N INITIAL AUDIT (BEFORE CORRECTIONS)")
    print(f"Files scanned: {report['files_scanned']}")
    print(f"Hardcoded human-readable candidates: {len(findings)}")
    print(f"FR keys: {len(fr)} | EN keys: {len(en)}")
    print(f"FR-only keys: {len(sf-se)} | EN-only keys: {len(se-sf)}")
    print("\nCATALOGUE DIFFERENCES")
    print("FR_ONLY:", json.dumps(sorted(sf-se),ensure_ascii=False))
    print("EN_ONLY:", json.dumps(sorted(se-sf),ensure_ascii=False))
    print("\nHARDCODED CANDIDATES (file:line | kind | text)")
    for x in findings: print(f"{x['file']}:{x['line']} | {x['kind']} | {x['text']}")
    print("\nUNUSED DECLARED KEYS")
    print("FR:", json.dumps(report["declared_keys_never_seen_as_source_text"]["fr_only_unused"],ensure_ascii=False))
    print("EN:", json.dumps(report["declared_keys_never_seen_as_source_text"]["en_only_unused"],ensure_ascii=False))

if __name__ == "__main__": main()
