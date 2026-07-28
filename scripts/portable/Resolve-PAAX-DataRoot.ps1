# Resolve-PAAX-DataRoot.ps1
# Canonical PAAX data-root resolution for PowerShell portable scripts.
#
# Resolution precedence (documented contract):
#   1. -DataRoot parameter (explicit caller argument)
#   2. PAAX_DATA_ROOT environment variable (if non-empty)
#   3. Windows default: %LOCALAPPDATA%\PAAX-AI\data
#
# If none of these yield a valid path, the script throws.
# The resolved path must be absolute and outside the installation tree.
#
# Usage:
#   . .\scripts\portable\Resolve-PAAX-DataRoot.ps1        # dot-source
#   $root = Resolve-PaaxDataRoot -DataRoot $DataRoot       # explicit
#   $root = Resolve-PaaxDataRoot                           # auto
#   $root = Resolve-PaaxDataRoot -InstallRoot $repoRoot    # with guard

[CmdletBinding()] param()

function Resolve-PaaxDataRoot {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [string]$DataRoot = "",
        [string]$InstallRoot = ""
    )

    $candidate = $null
    $source = $null

    if ($DataRoot -and $DataRoot.Trim()) {
        $candidate = $DataRoot.Trim()
        $source = "explicit -DataRoot argument"
    } elseif ($env:PAAX_DATA_ROOT -and $env:PAAX_DATA_ROOT.Trim()) {
        $candidate = $env:PAAX_DATA_ROOT.Trim()
        $source = "PAAX_DATA_ROOT environment variable"
    } elseif ($env:LOCALAPPDATA -and $env:LOCALAPPDATA.Trim()) {
        $candidate = Join-Path $env:LOCALAPPDATA "PAAX-AI\data"
        $source = "Windows LOCALAPPDATA default"
    } else {
        throw "Cannot determine PAAX_DATA_ROOT: no explicit path, no PAAX_DATA_ROOT env var, and LOCALAPPDATA is not set. Pass -DataRoot explicitly or set PAAX_DATA_ROOT."
    }

    # Must be absolute
    if (-not [System.IO.Path]::IsPathRooted($candidate)) {
        throw "PAAX data root must be an absolute path (from $source): '$candidate'. Set PAAX_DATA_ROOT to an absolute path."
    }

    $resolved = [System.IO.Path]::GetFullPath($candidate)

    # Must not be inside the installation/repository tree
    if ($InstallRoot -and $InstallRoot.Trim()) {
        $installResolved = [System.IO.Path]::GetFullPath($InstallRoot.Trim())
        if ($resolved.StartsWith($installResolved, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "PAAX data root ($resolved) is inside the installation tree ($installResolved). The data root must live outside the installation directory to survive updates. Source: $source."
        }
    }

    return $resolved
}

function Ensure-PaaxDataRootLayout {
    [CmdletBinding()]
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory)][string]$Root
    )

    $dirs = @("db","objects","uploads","jobs","cache","models","runtime","backups","migration","bootstrap")
    $paths = @{}

    # Create root if needed (fail on permission error)
    try {
        New-Item -ItemType Directory -Force -Path $Root | Out-Null
    } catch {
        throw "PAAX data root '$Root' is not writable: $_"
    }

    foreach ($d in $dirs) {
        $sub = Join-Path $Root $d
        New-Item -ItemType Directory -Force -Path $sub | Out-Null
        $paths[$d] = $sub
    }

    # Write version manifest (idempotent)
    $manifestPath = Join-Path $Root "data-root.json"
    if (Test-Path $manifestPath) {
        $existing = Get-Content $manifestPath -Raw | ConvertFrom-Json
        if ($existing.schema_version -ne "1.0") {
            throw "data-root.json schema_version mismatch at '$Root': expected '1.0', found '$($existing.schema_version)'. Manual migration may be required."
        }
    } else {
        @{
            schema_version = "1.0"
            layout         = $dirs
            created_at     = (Get-Date -Format "yyyy-MM-ddTHH:mm:sszzz")
        } | ConvertTo-Json | Set-Content $manifestPath -Encoding utf8
    }

    return $paths
}
