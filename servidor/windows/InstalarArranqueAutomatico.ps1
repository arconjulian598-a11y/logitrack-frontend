# Hace que la máquina virtual del servidor LogiTrack se encienda sola (sin ventana) cada vez que arranca Windows,
# aunque nadie inicie sesión. Ejecútelo una vez, con clic derecho > "Ejecutar con PowerShell" (o con el .cmd).
param([string]$Vm = 'LogiTrack-Servidor')
$ErrorActionPreference = 'Stop'

$vbox = Join-Path $env:ProgramFiles 'Oracle\VirtualBox\VBoxManage.exe'
if (-not (Test-Path $vbox)) { throw "No se encontró VirtualBox en $vbox. Instálelo primero." }
$vms = & $vbox list vms
if (-not ($vms -match "`"$([regex]::Escape($Vm))`"")) { throw "No existe una máquina virtual llamada '$Vm'. Máquinas encontradas:`n$vms" }

Write-Host "Se creará la tarea 'LogiTrack - encender servidor' que enciende '$Vm' al arrancar Windows."
Write-Host "Windows pedirá la contraseña de su usuario para poder encenderla aunque nadie inicie sesión."
$cred = Get-Credential -UserName "$env:USERDOMAIN\$env:USERNAME" -Message 'Contraseña de Windows de este usuario'

$accion = New-ScheduledTaskAction -Execute $vbox -Argument "startvm `"$Vm`" --type headless"
$disparador = New-ScheduledTaskTrigger -AtStartup
$disparador.Delay = 'PT1M'   # espera un minuto a que Windows termine de arrancar
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName 'LogiTrack - encender servidor' -Action $accion -Trigger $disparador -Settings $ajustes `
  -User $cred.UserName -Password $cred.GetNetworkCredential().Password -RunLevel Highest -Force | Out-Null
Write-Host "Listo: la tarea quedó registrada." -ForegroundColor Green

$r = Read-Host "¿Evitar que este computador se suspenda o hiberne (recomendado para un servidor)? [s/N]"
if ($r -match '^[sS]') {
  powercfg /change standby-timeout-ac 0
  powercfg /change hibernate-timeout-ac 0
  Write-Host "Suspensión e hibernación desactivadas con el cargador conectado." -ForegroundColor Green
}

$r = Read-Host "¿Encender la máquina virtual ahora? [S/n]"
if ($r -notmatch '^[nN]') { & $vbox startvm $Vm --type headless }
