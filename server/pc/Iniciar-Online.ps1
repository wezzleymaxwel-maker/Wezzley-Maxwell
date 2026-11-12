[CmdletBinding()]
param([switch]$VerificarArquivos)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
. (Join-Path $PSScriptRoot 'Host-Funcoes.ps1')
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'runtimes.json') -Raw | ConvertFrom-Json
$bundle = Join-Path $PSScriptRoot 'servidor.mjs'
if (-not (Test-Path -LiteralPath $bundle)) { throw 'Extraia o ZIP completo antes de abrir INICIAR-ONLINE.cmd.' }
$package = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'pacote.json') -Raw | ConvertFrom-Json
if (-not (Test-CaatingaHash $bundle $package.serverSha256)) { throw 'O servidor está incompleto. Baixe e extraia o ZIP novamente.' }
Write-Host ('CAATINGA — Servidor versão ' + $package.gameVersion + ' · ' + $package.build)
try {
    $latest = Invoke-RestMethod -Uri 'https://wezzleymaxwel-maker.github.io/Wezzley-Maxwell/release.json' -TimeoutSec 5
    if ($latest.build -and $package.build -and $latest.build -ne $package.build) {
        Write-Host 'Existe uma versão mais recente do servidor. Baixe o pacote novo pelo jogo.' -ForegroundColor Yellow
    }
} catch { Write-Host 'Não foi possível consultar atualizações; iniciando a versão instalada.' }

if ($VerificarArquivos) { Write-Output 'CAATINGA: arquivos do iniciador encontrados.'; return }
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Este iniciador é para Windows 10 ou 11 de 64 bits.' }
$architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
if (-not [Environment]::Is64BitOperatingSystem) { throw 'É necessário Windows de 64 bits para este iniciador.' }
$base = Join-Path $env:LOCALAPPDATA 'CAATINGA\Servidor'
$bin = Join-Path $base ('bin\' + $architecture)
$logs = Join-Path $base 'logs'
$data = Join-Path $base 'partidas'
foreach ($folder in @($base, $bin, $logs, $data)) { New-Item -ItemType Directory -Path $folder -Force | Out-Null }
$lock = $null; $nodeProcess = $null; $tunnelProcess = $null; $localUrl = $null; $control = $null
try {
    try { $lock = [IO.File]::Open((Join-Path $base 'servidor.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
    catch { throw 'O servidor já está aberto em outra janela. Use a janela que já está funcionando.' }
    Write-Host ''
    Write-Host '  CAATINGA - JOGUE COM AMIGOS PELA INTERNET' -ForegroundColor Yellow
    Write-Host ''
    $node = Join-Path $bin ('node-' + $manifest.nodeVersion + '.exe')
    if (-not (Test-Path -LiteralPath $node)) {
        Write-Host 'Preparando o servidor. No primeiro uso, os componentes serão baixados...'
        $archive = Join-Path $bin 'node.zip'
        $asset = $manifest.node.$architecture
        Get-CaatingaDownload $asset.url $archive $asset.sha256
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [IO.Compression.ZipFile]::OpenRead($archive)
        $nodeTemporary = $node + '.download'
        try {
            $entry = $zip.GetEntry($asset.entry)
            if ($null -eq $entry) { throw 'O pacote oficial do Node não contém o executável esperado.' }
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $nodeTemporary, $true)
            Move-Item -LiteralPath $nodeTemporary -Destination $node -Force
        } finally { $zip.Dispose(); if (Test-Path -LiteralPath $nodeTemporary) { Remove-Item -LiteralPath $nodeTemporary -Force } }
        Remove-Item -LiteralPath $archive -Force
    }
    $cloudflared = Join-Path $bin ('cloudflared-' + $manifest.cloudflared.version + '.exe')
    if (-not (Test-CaatingaHash $cloudflared $manifest.cloudflared.sha256)) {
        Write-Host 'Preparando a conexão com seus amigos...'
        Get-CaatingaDownload $manifest.cloudflared.url $cloudflared $manifest.cloudflared.sha256
    }
    $port = Get-CaatingaFreePort
    $localUrl = 'http://127.0.0.1:' + $port
    $random = New-Object byte[] 24
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($random) } finally { $rng.Dispose() }
    $control = -join ($random | ForEach-Object { $_.ToString('x2') })
    $env:PORT = [string]$port
    $env:CAATINGA_HOST = '127.0.0.1'
    $env:CAATINGA_ORIGINS = ([Uri]$manifest.gameUrl).GetLeftPart([UriPartial]::Authority)
    $env:CAATINGA_DATA_DIR = $data
    $env:CAATINGA_CONTROL_TOKEN = $control
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $nodeOut = Join-Path $logs ($stamp + '-servidor.log')
    $nodeError = Join-Path $logs ($stamp + '-servidor-erros.log')
    Write-Host 'Abrindo a partida no seu computador...'
    $nodeProcess = Start-Process -FilePath $node -ArgumentList ('"' + $bundle + '"') -WorkingDirectory $PSScriptRoot -NoNewWindow -PassThru -RedirectStandardOutput $nodeOut -RedirectStandardError $nodeError
    Wait-CaatingaHealth $localUrl $nodeProcess 20 $package.protocol
    $tunnelOut = Join-Path $logs ($stamp + '-conexao.log')
    $tunnelError = Join-Path $logs ($stamp + '-conexao-erros.log')
    $config = Join-Path $base 'conexao.yml'
    Set-Content -LiteralPath $config -Value 'protocol: http2' -Encoding Ascii
    $arguments = 'tunnel --config "' + $config + '" --no-autoupdate --url ' + $localUrl + ' --protocol http2'
    $tunnelProcess = Start-Process -FilePath $cloudflared -ArgumentList $arguments -WorkingDirectory $base -NoNewWindow -PassThru -RedirectStandardOutput $tunnelOut -RedirectStandardError $tunnelError
    Write-Host 'Conectando pela internet. Aguarde o jogo abrir...'
    $deadline = [DateTime]::UtcNow.AddSeconds(90)
    $publicUrl = $null
    while ([DateTime]::UtcNow -lt $deadline) {
        $tunnelProcess.Refresh()
        if ($tunnelProcess.HasExited) { throw ('A conexão foi encerrada. Detalhes em: ' + $tunnelError) }
        $text = ''
        foreach ($log in @($tunnelOut, $tunnelError)) { if (Test-Path -LiteralPath $log) { $text += Get-Content -LiteralPath $log -Raw } }
        $publicUrl = Get-CaatingaTunnelUrl $text
        if ($publicUrl) { break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $publicUrl) { throw ('Não foi possível criar a conexão. Detalhes em: ' + $tunnelError) }
    Wait-CaatingaHealth $publicUrl $tunnelProcess 90 $package.protocol
    $gameUrl = (Get-CaatingaGameUrl $manifest.gameUrl $publicUrl) + '&v=' + [Uri]::EscapeDataString([string]$package.build)
    Write-Host 'Para retomar uma partida, mantenha a aba antiga e informe nela este novo endereço do servidor.'
    Set-Content -LiteralPath (Join-Path $base 'abrir-jogo.url') -Value ("[InternetShortcut]`r`nURL=" + $gameUrl) -Encoding Ascii
    Start-Process $gameUrl
    Write-Host ''
    Write-Host 'PRONTO! No jogo, digite seu nome e clique em CRIAR SALA.' -ForegroundColor Green
    Write-Host 'Depois, clique em COPIAR CONVITE e envie aos seus amigos.'
    Write-Host ''
    Write-Host 'Seu jogo: ' $gameUrl
    Write-Host ''
    Write-Host 'Mantenha esta janela aberta durante a partida.' -ForegroundColor Yellow
    Write-Host 'Pressione ENTER para encerrar o servidor.'
    while ($true) {
        Start-Sleep -Milliseconds 500
        $nodeProcess.Refresh(); $tunnelProcess.Refresh()
        if ($nodeProcess.HasExited -or $tunnelProcess.HasExited) { throw ('O servidor ou a conexão parou. Inicie novamente. Logs em: ' + $logs) }
        try { if ([Console]::KeyAvailable -and [Console]::ReadKey($true).Key -eq [ConsoleKey]::Enter) { break } } catch { }
    }
} catch {
    Write-Host ''
    Write-Host ('Não foi possível iniciar: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host ('Arquivos de diagnóstico: ' + $logs)
    exit 1
} finally {
    if ($null -ne $nodeProcess -and -not $nodeProcess.HasExited) {
        try {
            Invoke-RestMethod -Uri ($localUrl + '/host/stop') -Method Post -Headers @{ Authorization = ('Bearer ' + $control) } -TimeoutSec 5 | Out-Null
            Wait-Process -Id $nodeProcess.Id -Timeout 8 -ErrorAction SilentlyContinue
        } catch { }
        if (-not $nodeProcess.HasExited) { Stop-Process -Id $nodeProcess.Id -Force -ErrorAction SilentlyContinue }
    }
    if ($null -ne $tunnelProcess -and -not $tunnelProcess.HasExited) { Stop-Process -Id $tunnelProcess.Id -Force -ErrorAction SilentlyContinue }
    if ($null -ne $lock) { $lock.Dispose() }
}
