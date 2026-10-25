@echo off
title LZ Studio - Diagnostico de Home y USB
echo LZ Studio - Lectura del estado actual. No envia movimientos ni cortes.
echo Deja Box y el conector abiertos. No compartas el codigo permanente.
echo.
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; try { $p=Join-Path $env:LOCALAPPDATA 'LZStudioTools\K40\pairing.json'; $pair=Get-Content -LiteralPath $p -Raw | ConvertFrom-Json; $headers=@{Origin='https://www.lzstudiotools.com';Authorization=('Bearer '+$pair.token)}; $r=Invoke-RestMethod -Uri 'http://127.0.0.1:17840/status' -Headers $headers -TimeoutSec 12; if($r.protocol -ne 'lz-k40-m2/v1'){throw 'El servicio no es el conector LZ K40'}; $usb='Sin lectura'; if($null -ne $r.controllerStatus){$usb=('0x{0:X2}' -f [int]$r.controllerStatus)}; [pscustomobject]@{Version=$r.bridgeVersion;Estado=$r.state;Operacion=$r.operation;Conectada=$r.connected;Simulacion=$r.simulation;EstadoUSB=$usb;DatosEnviados=$r.percent;Posicion=($r.position -join ', ');Mensaje=$r.message} | Format-List } catch { Write-Host ('ERROR DE DIAGNOSTICO: '+$_.Exception.Message) }"
echo.
echo Toma una captura de esta ventana y enviala en el chat.
pause
