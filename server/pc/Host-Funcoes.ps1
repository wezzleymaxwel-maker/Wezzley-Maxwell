function Get-CaatingaTunnelUrl([string]$Text) {
    $match = [regex]::Match($Text, 'https://(?!api\.)[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com\b(?![a-z0-9.-])')
    if ($match.Success) { return $match.Value }
    return $null
}
function Get-CaatingaGameUrl([string]$GameUrl, [string]$Endpoint) {
    $builder = New-Object System.UriBuilder($GameUrl)
    $builder.Query = 'servidor=' + [Uri]::EscapeDataString($Endpoint)
    $builder.Fragment = ''
    return $builder.Uri.AbsoluteUri
}
function Test-CaatingaHash([string]$Path, [string]$Expected) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -eq $Expected
}
function Get-CaatingaFreePort {
    $listener = New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
    try { $listener.Start(); return $listener.LocalEndpoint.Port }
    finally { $listener.Stop() }
}
function Get-CaatingaDownload([string]$Url, [string]$Path, [string]$Hash) {
    if (Test-CaatingaHash $Path $Hash) { return }
    $temporary = $Path + '.download'
    try {
        Invoke-WebRequest -Uri $Url -OutFile $temporary -UseBasicParsing -TimeoutSec 600 -UserAgent 'CAATINGA-PC-Host/1'
        if (-not (Test-CaatingaHash $temporary $Hash)) { throw 'O download ficou incompleto ou diferente do arquivo oficial. Tente iniciar novamente.' }
        Move-Item -LiteralPath $temporary -Destination $Path -Force
    } finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force } }
}
function Wait-CaatingaHealth([string]$Url, $Process, [int]$Seconds = 60) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $Process.Refresh()
        if ($Process.HasExited) { throw 'O processo do servidor ou do túnel foi encerrado durante a inicialização.' }
        try {
            $health = Invoke-RestMethod -Uri ($Url + '/health') -Method Get -TimeoutSec 5
            if ($health.game -eq 'CAATINGA' -and $health.protocol -eq 1) { return }
        } catch { }
        Start-Sleep -Milliseconds 700
    }
    throw 'A conexão ainda não respondeu. Confira sua internet e execute INICIAR-ONLINE novamente.'
}
