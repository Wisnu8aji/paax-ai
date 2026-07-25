[CmdletBinding()] param([Parameter(Mandatory=$true)][string]$BackupPath,[switch]$DryRun)
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$args=@((Join-Path $repoRoot "scripts\portable\backup_restore.py"),"restore","--source",$BackupPath,"--target",$repoRoot)
if ($DryRun) { $args += "--dry-run" }
python @args
