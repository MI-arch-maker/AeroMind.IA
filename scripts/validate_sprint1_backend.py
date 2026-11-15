#!/usr/bin/env python3
"""Run backend validation against a source directory with isolated local state."""
import argparse
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    source = args.source.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='aeromind-sprint1-tests-') as temp:
        env = os.environ.copy()
        env.update({
            'AEROMIND_ENV': 'development',
            'AEROMIND_SESSION_SECRET': secrets.token_hex(32),
            'DATABASE_URL': f'sqlite:///{temp}/test.sqlite3',
            'AEROMIND_ENGINEERING_STORAGE_DIR': f'{temp}/engineering',
            'AEROMIND_CAD_STORAGE_DIR': f'{temp}/cad',
            'AEROMIND_VIRTUAL_ONLY': 'true',
            'HARDWARE_CONTROL': 'false',
            'AEROMIND_ENGINEERING_WORKER_ENABLED': 'false',
            'AEROMIND_SITL_AUTOSTART': 'false',
            'PYTHONPATH': str(source),
        })
        command = [sys.executable, '-m', 'pytest', 'tests', '-q',
                   '--ignore=tests/test_v6_real_postgresql.py',
                   '--ignore=tests/test_v8_features.py',
                   '--ignore=tests/test_migrations.py',
                   f'--junitxml={output / "backend.xml"}']
        with (output / 'backend.log').open('w') as log:
            result = subprocess.run(command, cwd=source, env=env, stdout=log, stderr=subprocess.STDOUT)
        print((output / 'backend.log').read_text()[-10000:])
        print(f'Exit code: {result.returncode}; journal: {output / "backend.log"}', flush=True)
        return result.returncode


if __name__ == '__main__':
    raise SystemExit(main())
