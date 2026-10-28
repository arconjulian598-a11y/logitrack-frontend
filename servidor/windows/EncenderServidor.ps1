# Enciende la máquina virtual del servidor sin ventana (si no está encendida).
param([string]$Vm = 'LogiTrack-Servidor')
$vbox = Join-Path $env:ProgramFiles 'Oracle\VirtualBox\VBoxManage.exe'
if ((& $vbox list runningvms) -match "`"$([regex]::Escape($Vm))`"") { Write-Host "'$Vm' ya está encendida." }
else { & $vbox startvm $Vm --type headless }
