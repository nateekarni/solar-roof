import hashlib, json, os, subprocess, time
from pathlib import Path
now = time.time()
# Version 1: sorted JSON object, ASCII escapes, compact separators, UTF-8 bytes.
configuration = {key: value for key, value in os.environ.items()
                 if key.startswith(('BACKUP_', 'PGBACKREST_')) or key in ('POSTGRES_DB', 'POSTGRES_USER', 'PGDATA')}
configuration_fingerprint = hashlib.sha256(json.dumps(configuration, sort_keys=True, ensure_ascii=True, separators=(',', ':')).encode('utf-8')).hexdigest()
status = dict(configurationFingerprintVersion=1, configurationFingerprint=configuration_fingerprint, observedAt=now, schedulerHeartbeatAt=now, lastSuccessfulBackupAt=None, backupId=None,
              lastArchivedAt=None, failedArchives=None, lastFailedAt=None, pgWalBytes=None, rawDiskUsedPercent=None, pendingWalCount=None, oldestPendingWalAt=None, archiveError=None)
try:
    disk = os.statvfs(os.environ.get("PGDATA", "/var/lib/postgresql/data"))
    status["rawDiskUsedPercent"] = round(100 * (1 - disk.f_bavail / disk.f_blocks), 2) if disk.f_blocks else None
    sql = "SELECT json_build_object('lastArchivedAt',extract(epoch from last_archived_time),'failedArchives',failed_count,'lastFailedAt',extract(epoch from last_failed_time),'pendingWalCount',(SELECT count(*) FROM pg_ls_archive_statusdir() WHERE name LIKE '%.ready'),'oldestPendingWalAt',(SELECT extract(epoch from min(modification)) FROM pg_ls_archive_statusdir() WHERE name LIKE '%.ready'),'pgWalBytes',(SELECT coalesce(sum(size),0) FROM pg_ls_waldir())) FROM pg_stat_archiver"
    status.update(json.loads(subprocess.check_output(['psql','-U',os.environ.get('POSTGRES_USER','postgres'),'-d',os.environ.get('POSTGRES_DB','postgres'),'-Atc',sql], text=True, timeout=10)))
    info = json.loads(subprocess.check_output(['pgbackrest','--stanza=solar','--output=json','info'], text=True, timeout=30))
    backups = info[0].get('backup', [])
    if backups:
        latest = max(backups, key=lambda b: b['timestamp']['stop'])
        status.update(lastSuccessfulBackupAt=latest['timestamp']['stop'], backupId=latest['label'])
except Exception:
    status['archiveError'] = 'Backup/archive status unavailable; inspect restricted container logs'
p = Path('/var/lib/solar-backup/status.json')
tmp = p.with_suffix('.tmp')
tmp.write_text(json.dumps(status))
tmp.chmod(0o644)
tmp.replace(p)