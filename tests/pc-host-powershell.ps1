$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
foreach($file in Get-ChildItem "$root/server/pc/*.ps1") {
 $tokens=$null;$errors=$null
 [void][System.Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errors)
 if($errors.Count){throw ($errors|Out-String)}
}
. "$root/server/pc/Host-Funcoes.ps1"
function Assert($condition,$message){if(-not $condition){throw $message}}
Assert ((Get-CaatingaTunnelUrl '2026-11 INFO https://terra-sol-casa.trycloudflare.com | ready') -eq 'https://terra-sol-casa.trycloudflare.com') 'Tunnel URL parsing'
Assert ($null -eq (Get-CaatingaTunnelUrl 'https://api.trycloudflare.com/tunnel')) 'Control API is not a game URL'
Assert ($null -eq (Get-CaatingaTunnelUrl 'https://trycloudflare.com.evil.example')) 'Invalid host rejected'
Assert ($null -eq (Get-CaatingaTunnelUrl 'https://terra-sol.trycloudflare.com.evil.example')) 'Subdomain suffix rejected'
Assert ($null -eq (Get-CaatingaTunnelUrl 'https://foo.example/')) 'Other domains rejected'
$link=Get-CaatingaGameUrl 'https://wezzleymaxwel-maker.github.io/Wezzley-Maxwell/?old=x#old' 'https://terra-sol-casa.trycloudflare.com'
Assert ($link -eq 'https://wezzleymaxwel-maker.github.io/Wezzley-Maxwell/?servidor=https%3A%2F%2Fterra-sol-casa.trycloudflare.com') 'Game invitation encoding'
$port=Get-CaatingaFreePort
Assert ($port -gt 0 -and $port -lt 65536) 'Free loopback port'
$file=Join-Path ([IO.Path]::GetTempPath()) ('caatinga-'+[Guid]::NewGuid()+'.txt')
try {Set-Content $file 'CAATINGA';$hash=(Get-FileHash $file).Hash;Assert (Test-CaatingaHash $file $hash) 'Valid SHA';Assert (-not (Test-CaatingaHash $file ('0'*64))) 'Corrupt file rejected'}finally{Remove-Item $file -ErrorAction SilentlyContinue}
& "$root/release/pc-host/Iniciar-Online.ps1" -VerificarArquivos
Write-Output 'PASS: PowerShell syntax, tunnel parsing, invite encoding, loopback port, SHA-256 and portable package verification.'
