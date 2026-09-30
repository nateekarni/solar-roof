from pathlib import Path
import difflib
import json
import hashlib
root=Path(__file__).parent/'files'
workspace=Path(__file__).resolve().parents[2]
patch=''
manifest=[]
baseline={}
for file in sorted(root.rglob('*')):
    if not file.is_file(): continue
    relative=file.relative_to(root).as_posix()
    current=workspace/relative
    before=current.read_text(encoding='utf-8') if current.exists() else ''
    after=file.read_text(encoding='utf-8')
    if before == after: continue
    manifest.append(relative)
    baseline[relative]=hashlib.sha256(current.read_bytes()).hexdigest() if current.exists() else None
    patch+=''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/'+relative if current.exists() else '/dev/null',tofile='b/'+relative))
(workspace/'docs/financial-proposal.patch').write_bytes(patch.encode('utf-8'))
(root.parent/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
(root.parent/'patch-base-hashes.json').write_text(json.dumps(baseline,indent=2)+'\n',encoding='utf-8')
print(f'{len(manifest)} changed/new files; patch generated, not applied')
