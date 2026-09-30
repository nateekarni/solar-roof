"""Build a disposable source overlay without modifying active application files."""
from pathlib import Path
import hashlib
import json
import shutil

root = Path(__file__).resolve().parents[2]
proposal = Path(__file__).parent
overlay = proposal / 'validation'
overlay.mkdir(exist_ok=True)
for relative in ['tsconfig.base.json', 'package.json', 'pnpm-workspace.yaml']:
    shutil.copy2(root / relative, overlay / relative)
for relative in ['apps/api', 'apps/web', 'apps/worker', 'packages', 'infra/migrations']:
    shutil.copytree(root / relative, overlay / relative, dirs_exist_ok=True,
        ignore=shutil.ignore_patterns('node_modules', '.next', 'dist', '.turbo', 'artifacts', '*.tsbuildinfo'))
for source in (proposal / 'files').rglob('*'):
    if source.is_file():
        target = overlay / source.relative_to(proposal / 'files')
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
# Root node_modules is found naturally by upward resolution. Package-local modules
# are linked to installed dependencies, never copied or installed in active source.
for relative in ['apps/api', 'apps/web', 'apps/worker']:
    link = overlay / relative / 'node_modules'
    if not link.exists():
        import subprocess
        subprocess.run(['cmd', '/c', 'mklink', '/J', str(link), str(root / relative / 'node_modules')], check=True)
print(overlay)
