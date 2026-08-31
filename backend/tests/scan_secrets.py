import os
import re

SUSPICIOUS_PATTERNS = [
    (re.compile(r'(?i)(?:api_key|apikey|secret_key|private_key)\s*[:=]\s*[\'"][^\'"]{8,}[\'"]'), "API Key / Private Secret"),
    (re.compile(r'(?i)password\s*[:=]\s*[\'"][^\'"]{6,}[\'"]'), "Hardcoded Password")
]

IGNORED_DIRS = {'.git', 'node_modules', '.gemini'}
IGNORED_FILES = {'.env.example', '001_initial_schema.sql'}

found = []
for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]
    for file in files:
        if file in IGNORED_FILES or file.endswith('.example'):
            continue
        if file.endswith(('.js', '.json', '.html', '.py', '.yml', '.yaml', '.conf')):
            path = os.path.join(root, file)
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    for idx, line in enumerate(f, 1):
                        for pat, desc in SUSPICIOUS_PATTERNS:
                            if pat.search(line):
                                found.append((path, idx, desc, line.strip()))
            except Exception:
                pass

print(f"Secret Scan Complete: {len(found)} candidate occurrences found.")
for p, l, desc, txt in found:
    print(f"  - [{desc}] {p}:{l} -> {txt[:70]}")
