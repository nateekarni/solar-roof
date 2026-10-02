import os, shutil, subprocess, tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[2]
(root/"test/artifacts").mkdir(parents=True,exist_ok=True)
bash = "C:/Program Files/Git/bin/bash.exe" if os.name=="nt" else shutil.which("bash")
if not bash or not Path(bash).is_file(): raise RuntimeError("Git Bash (Windows) or bash (Linux) is required")
with tempfile.TemporaryDirectory(prefix='d2-sampler-',dir=root/'test/artifacts') as tmp:
 p=Path(tmp);b=p/'bin';b.mkdir()
 for name,source in {
  'su-exec':'#!/usr/bin/env bash\nshift; exec "$@"\n',
  'python3':'#!/usr/bin/env bash\nprintf "%s\\n" "$EPOCHREALTIME" >> "$STATE/ticks"\n',
  'sleep':'#!/usr/bin/env bash\nif [[ "$1" == 15 ]]; then exec /usr/bin/sleep .1; else exec /usr/bin/sleep "$@"; fi\n',
 }.items():
  (b/name).write_text(source,newline='\n');(b/name).chmod(0o755)
 script='''#!/usr/bin/env bash
set -euo pipefail
if command -v cygpath >/dev/null 2>&1; then export STATE="$(cygpath -u "$STATE")"; fi
export PATH="$STATE/bin:$PATH"
bash infra/docker/postgres-backup/status-sampler.sh & sampler=$!
trap 'kill -TERM "$sampler" 2>/dev/null || true; wait "$sampler" 2>/dev/null || true' EXIT
/usr/bin/sleep 1.5 & backup=$!
/usr/bin/sleep 1
kill -0 "$backup"
[[ $(wc -l < "$STATE/ticks") -ge 3 ]]
wait "$backup"
kill -TERM "$sampler"; wait "$sampler"
trap - EXIT
before=$(wc -l < "$STATE/ticks"); /usr/bin/sleep .5; [[ $(wc -l < "$STATE/ticks") == "$before" ]]
printf 'PASS actual sampler continues while backup child blocks; SIGTERM exits cleanly (interval scaled only in fixture)\\n'
'''
 (p/'test.sh').write_text(script,newline='\n')
 env={**os.environ,'STATE':str(p).replace('\\','/')}
 subprocess.run([bash,str(p/'test.sh')],cwd=root,env=env,check=True)
