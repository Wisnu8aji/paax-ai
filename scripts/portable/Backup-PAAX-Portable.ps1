[CmdletBinding()] param([string]$OutputPath="")
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if (-not $OutputPath) { $OutputPath=Join-Path $repoRoot ("backups\PAAX-backup-"+(Get-Date -Format "yyyyMMdd-HHmmss")+".zip") }
python (Join-Path $repoRoot "scripts\portable\backup_restore.py") backup --output $OutputPath
