Set-StrictMode -Version Latest

# Evidence integrity sidecar helpers (audit finding H9).
#
# Release-gate evidence JSON files are read with Get-Content | ConvertFrom-Json
# with no integrity check. An attacker or process with filesystem access can
# tamper with fields (peer_identity_verified, relay_status, route_evidence_count)
# between when evidence is written and when it is verified, defeating the gate.
#
# These helpers write a SIDECAR (<evidence>.sha256) next to each evidence file
# recording the SHA256 of the evidence bytes, and recompute+compare that hash
# before the evidence is trusted. This is ADDITIVE: the evidence JSON schema is
# unchanged and existing readers that ignore the sidecar keep working.
#
# The sidecar reuses Get-FileHash (the same primitive already used by
# record-msix-install-evidence.ps1 and record-p2p-control-plane-evidence.ps1);
# no new crypto scheme is introduced.

$script:EvidenceIntegritySidecarSchema = "musu.evidence_integrity_sidecar.v1"

function Get-EvidenceFileSha256 {
    <#
        Returns the lowercase SHA256 hex digest of a file. Prefers Get-FileHash
        (the same primitive the existing recorders use) and falls back to the
        .NET SHA256 provider on hosts where the Microsoft.PowerShell.Utility
        Get-FileHash cmdlet is unavailable (some minimal Windows PowerShell 5.1
        environments). Both paths compute the identical SHA256 digest.
    #>
    param([Parameter(Mandatory = $true)][string]$Path)

    $getFileHash = Get-Command -Name "Get-FileHash" -ErrorAction SilentlyContinue
    if ($getFileHash) {
        return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
    }

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.IO.File]::ReadAllBytes($Path)
        $digest = $sha256.ComputeHash($bytes)
        return ([System.BitConverter]::ToString($digest) -replace "-", "").ToLowerInvariant()
    }
    finally {
        $sha256.Dispose()
    }
}

function Get-EvidenceIntegritySidecarPath {
    param([Parameter(Mandatory = $true)][string]$EvidencePath)

    return ($EvidencePath + ".sha256")
}

function Write-EvidenceIntegritySidecar {
    <#
        Writes <EvidencePath>.sha256 recording the SHA256 of the evidence file.
        Returns the sidecar path. Call this immediately after writing the
        evidence JSON so the recorded hash matches the bytes on disk.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$EvidencePath
    )

    if (-not (Test-Path -LiteralPath $EvidencePath)) {
        throw "Cannot write integrity sidecar; evidence file not found: $EvidencePath"
    }

    $hash = Get-EvidenceFileSha256 -Path $EvidencePath
    $sidecarPath = Get-EvidenceIntegritySidecarPath -EvidencePath $EvidencePath
    $fileName = [System.IO.Path]::GetFileName($EvidencePath)

    $sidecar = [pscustomobject]@{
        schema = $script:EvidenceIntegritySidecarSchema
        algorithm = "sha256"
        evidence_file = $fileName
        sha256 = $hash
        recorded_at = ([datetimeoffset]::Now).ToString("o")
    }

    $sidecar | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $sidecarPath -Encoding UTF8
    return $sidecarPath
}

function Test-EvidenceIntegritySidecar {
    <#
        Recomputes the SHA256 of EvidencePath and compares it to the value
        recorded in the <EvidencePath>.sha256 sidecar.

        Returns a result object:
          status     : "verified" | "tampered" | "missing" | "malformed"
          ok         : $true only when status is "verified"
          expected   : recorded hash (or "")
          actual     : recomputed hash
          sidecar_path
          message

        Tamper (recomputed hash != recorded hash) and malformed sidecar are
        always failures. "missing" (no sidecar) is reported as not-ok so the
        caller decides whether to treat absence as a hard failure (release gate)
        or tolerate it (backward compatibility with pre-H9 evidence).
    #>
    param(
        [Parameter(Mandatory = $true)][string]$EvidencePath
    )

    $sidecarPath = Get-EvidenceIntegritySidecarPath -EvidencePath $EvidencePath
    $actual = ""
    if (Test-Path -LiteralPath $EvidencePath) {
        $actual = Get-EvidenceFileSha256 -Path $EvidencePath
    }

    if (-not (Test-Path -LiteralPath $sidecarPath)) {
        return [pscustomobject]@{
            status = "missing"
            ok = $false
            expected = ""
            actual = $actual
            sidecar_path = $sidecarPath
            message = "integrity sidecar is missing: $([System.IO.Path]::GetFileName($sidecarPath))"
        }
    }

    $expected = ""
    $sidecar = $null
    try {
        $sidecar = Get-Content -LiteralPath $sidecarPath -Raw | ConvertFrom-Json
        if ($sidecar -and $sidecar.PSObject.Properties["sha256"] -and $null -ne $sidecar.sha256) {
            $expected = ([string]$sidecar.sha256).Trim().ToLowerInvariant()
        }
    }
    catch {
        $expected = ""
    }

    if (
        -not $sidecar -or
        -not $sidecar.PSObject.Properties["schema"] -or
        [string]$sidecar.schema -ne $script:EvidenceIntegritySidecarSchema
    ) {
        return [pscustomobject]@{
            status = "malformed"
            ok = $false
            expected = $expected
            actual = $actual
            sidecar_path = $sidecarPath
            message = "integrity sidecar schema is malformed or missing"
        }
    }

    if (
        -not $sidecar.PSObject.Properties["algorithm"] -or
        [string]$sidecar.algorithm -ne "sha256"
    ) {
        return [pscustomobject]@{
            status = "malformed"
            ok = $false
            expected = $expected
            actual = $actual
            sidecar_path = $sidecarPath
            message = "integrity sidecar algorithm must be sha256"
        }
    }

    $expectedFileName = [System.IO.Path]::GetFileName($EvidencePath)
    $sidecarFileName = ""
    if ($sidecar.PSObject.Properties["evidence_file"] -and $null -ne $sidecar.evidence_file) {
        $sidecarFileName = [string]$sidecar.evidence_file
    }
    if ($sidecarFileName -ne $expectedFileName) {
        return [pscustomobject]@{
            status = "malformed"
            ok = $false
            expected = $expected
            actual = $actual
            sidecar_path = $sidecarPath
            message = "integrity sidecar evidence_file mismatch: expected $expectedFileName"
        }
    }

    if ([string]::IsNullOrWhiteSpace($expected) -or $expected -notmatch "^[0-9a-f]{64}$") {
        return [pscustomobject]@{
            status = "malformed"
            ok = $false
            expected = $expected
            actual = $actual
            sidecar_path = $sidecarPath
            message = "integrity sidecar is malformed or missing a sha256 value"
        }
    }

    if ($expected -eq $actual) {
        return [pscustomobject]@{
            status = "verified"
            ok = $true
            expected = $expected
            actual = $actual
            sidecar_path = $sidecarPath
            message = "evidence sha256 matches recorded integrity sidecar"
        }
    }

    return [pscustomobject]@{
        status = "tampered"
        ok = $false
        expected = $expected
        actual = $actual
        sidecar_path = $sidecarPath
        message = "evidence sha256 does not match recorded integrity sidecar; evidence may have been tampered with after recording"
    }
}
