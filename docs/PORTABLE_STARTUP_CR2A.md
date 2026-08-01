# Portable startup (CR2A)

This procedure starts the six local PAAX services from one runtime identity
without serialising the internal service key into a launcher, command line,
manifest, or log.

1. Stop the existing stack and verify the six ports are clear.

```powershell
.\scripts\portable\Stop-PLHUT-Local.ps1 -DataRoot G:\PAAX-Data
Get-NetTCPConnection -LocalPort 3000,8001,8081,8082,8083,8085 -State Listen
```

2. Back up the portable database before the one-time schema bridge.

```powershell
.\scripts\portable\Backup-PAAX-Portable.ps1
.\.venv\Scripts\python.exe .\scripts\portable\migrate_portable_schema.py --database G:\PAAX-Data\db\portable.sqlite
```

The migration validates legacy tables before stamping baseline `0036`, then
applies `0037_package_index_materialization`. A checksum-verified `.pre-cr2a.bak`
is retained beside the database. If migration fails, do not start the stack;
restore the backup with the normal portable restore procedure.

3. Materialize the project/run canonical package index explicitly using the
owner/PM DB endpoint. The reader endpoint never creates columns or entries.

4. Start the stack.

```powershell
.\scripts\portable\Start-PLHUT-Local.ps1 -DataRoot G:\PAAX-Data
```

The launcher applies a user-only ACL to `runtime\internal-service.key`, creates
children with `ProcessStartInfo` and an in-memory environment block, and waits
for each authenticated dependency. It fails closed on foreign port ownership,
migration failure, or a mismatched runtime identity.

5. Run the live acceptance suite only after all six ports listen. Valid probes
must be 200; the suite separately verifies missing and invalid credentials fail
closed.
