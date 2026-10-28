# Apaga la máquina virtual del servidor en orden (como presionar el botón de encendido), para no dañar las bases.
param([string]$Vm = 'LogiTrack-Servidor')
$vbox = Join-Path $env:ProgramFiles 'Oracle\VirtualBox\VBoxManage.exe'
& $vbox controlvm $Vm acpipowerbutton
Write-Host "Apagando '$Vm'... (tarda unos segundos)"
