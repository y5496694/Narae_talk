param([Parameter(Mandatory=$true)][string]$Helper,[Parameter(Mandatory=$true)][string]$Job)
$ErrorActionPreference='Stop'
$stage=Split-Path -Parent $Job
$arguments=@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',('"'+$Helper+'"'),'-Job',('"'+$Job+'"'))
# Start a separate hidden console; an Electron-owned child can die with the app.
$helperProcess=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $stage 'installer.stdout.log') -RedirectStandardError (Join-Path $stage 'installer.stderr.log')
[IO.File]::WriteAllText((Join-Path $stage 'helper-pid.txt'),[string]$helperProcess.Id)
