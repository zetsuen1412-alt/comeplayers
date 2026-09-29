[CmdletBinding()]
param(
    [ValidateSet('Verify','PlayMode','Windows','Android')][string]$Task = 'Verify',
    [string]$EditorPath = $env:UNITY_EDITOR_PATH,
    [ValidateRange(1,180)][int]$TimeoutMinutes = 45
)
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$versionText = Get-Content -Raw -LiteralPath (Join-Path $projectPath 'ProjectSettings/ProjectVersion.txt')
$requestedVersion = [regex]::Match($versionText, '(?m)^m_EditorVersion:\s*(\S+)').Groups[1].Value
$logs = Join-Path $projectPath 'Logs'
$null = New-Item -ItemType Directory -Path $logs -Force
$reportPath = Join-Path $logs 'unity-invocation.json'
$runId = [guid]::NewGuid().ToString('N')
$detectedVersion = ''
function Write-Result([string]$status, [string]$detail, [int]$exitCode) {
    [ordered]@{
        task = $Task; status = $status; detail = $detail; exitCode = $exitCode
        requestedVersion = $requestedVersion; runId = $runId
        detectedVersion = $detectedVersion
        editor = $EditorPath; timestampUtc = [datetime]::UtcNow.ToString('o')
    } | ConvertTo-Json | Set-Content -LiteralPath $reportPath -Encoding utf8
    Write-Output "$status : $detail"
}
try {
    if ($requestedVersion -notmatch '^6000\.0\.\d+f\d+$') {
        throw 'ProjectVersion.txt must pin an explicit Unity 6000.0 release before invoking this build script.'
    }
    if (!$EditorPath) {
        $candidates = [Collections.Generic.List[string]]::new()
        $roots = @('C:/Program Files/Unity/Hub/Editor', '/Applications/Unity/Hub/Editor', (Join-Path $HOME 'Unity/Hub/Editor'))
        foreach ($root in $roots) {
            if (!(Test-Path -LiteralPath $root -PathType Container)) { continue }
            foreach ($version in (Get-ChildItem -LiteralPath $root -Directory | Where-Object Name -EQ $requestedVersion)) {
                foreach ($suffix in @('Editor/Unity.exe','Unity.app/Contents/MacOS/Unity','Editor/Unity')) {
                    $candidate = Join-Path $version.FullName $suffix
                    if (Test-Path -LiteralPath $candidate -PathType Leaf) { $candidates.Add($candidate) }
                }
            }
        }
        # A PATH command named unity can be Unity CLI, not the Editor executable.
        if ($candidates.Count -gt 0) { $EditorPath = $candidates[0] }
    }
    if (!$EditorPath -or !(Test-Path -LiteralPath $EditorPath -PathType Leaf)) {
        Write-Result 'not_available' "Unity Editor $requestedVersion was not found. Install that version with the desired build support and a valid license, then pass -EditorPath or UNITY_EDITOR_PATH. No Unity compile, Play Mode, or build has run." 2
        exit 2
    }
    $EditorPath = (Resolve-Path -LiteralPath $EditorPath).Path
    $editorDirectory = Split-Path -Parent $EditorPath
    $editorLayout = (Test-Path -LiteralPath (Join-Path $editorDirectory 'Data/Managed') -PathType Container) -or
        (Test-Path -LiteralPath (Join-Path (Split-Path -Parent $editorDirectory) 'Managed') -PathType Container)
    if (!$editorLayout) { throw 'EditorPath does not have a Unity Editor installation layout. Point to Editor/Unity.exe, not Unity CLI or Unity Hub.' }
    # -version prints the engine version without opening the Editor/project.
    # Refuse a different patch before Unity can migrate or rewrite project assets.
    $versionInfo = [Diagnostics.ProcessStartInfo]::new()
    $versionInfo.FileName = $EditorPath
    $versionInfo.UseShellExecute = $false
    $versionInfo.CreateNoWindow = $true
    $versionInfo.RedirectStandardOutput = $true
    $versionInfo.RedirectStandardError = $true
    $versionInfo.ArgumentList.Add('-version')
    $versionProcess = [Diagnostics.Process]::Start($versionInfo)
    try {
        $versionOutput = $versionProcess.StandardOutput.ReadToEndAsync()
        $versionError = $versionProcess.StandardError.ReadToEndAsync()
        if (!$versionProcess.WaitForExit(15000)) {
            $versionProcess.Kill($true)
            throw 'Unity did not answer the version-only check within 15 seconds; the project was not opened.'
        }
        $versionText = $versionOutput.GetAwaiter().GetResult() + $versionError.GetAwaiter().GetResult()
        $detectedVersion = [regex]::Match($versionText, '\b\d+\.\d+\.\d+[abfp]\d+\b').Value
        if ($versionProcess.ExitCode -ne 0 -or $detectedVersion -ne $requestedVersion) {
            throw "Editor version '$detectedVersion' does not match pinned version '$requestedVersion'; the project was not opened."
        }
    }
    finally { $versionProcess.Dispose() }
    $logPath = Join-Path $logs ("unity-" + $Task.ToLowerInvariant() + '.log')
    # Keep diagnostics specific to this invocation if Unity exits before writing a log.
    [IO.File]::WriteAllText($logPath, '')
    $method = switch ($Task) { 'Windows' { 'BuildWindows' }; 'Android' { 'BuildAndroid' }; 'PlayMode' { 'PlayMode' }; default { 'Verify' } }
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $EditorPath
    $startInfo.WorkingDirectory = $projectPath
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $arguments = @('-batchmode','-projectPath',$projectPath)
    # Runtime smoke needs frames, a graphics device and an asynchronous exit.
    if ($Task -ne 'PlayMode') { $arguments += @('-nographics','-quit') }
    if ($Task -eq 'Windows' -or $Task -eq 'Android') { $arguments += @('-buildTarget',$(if ($Task -eq 'Android') { 'Android' } else { 'Win64' })) }
    $arguments += @('-executeMethod',("ComePlayers.CrazyRich.Editor.CrwtBuildMenu." + $method),'-logFile',$logPath,'-crwtRunId',$runId)
    foreach ($argument in $arguments) {
        $startInfo.ArgumentList.Add($argument)
    }
    Write-Output "Running Unity $Task. Log: $logPath"
    $process = [Diagnostics.Process]::Start($startInfo)
    $timer = [Diagnostics.Stopwatch]::StartNew()
    while (!$process.WaitForExit(30000)) {
        Write-Output ("Unity is running ({0:N1} minutes)." -f $timer.Elapsed.TotalMinutes)
        if ($timer.Elapsed.TotalMinutes -ge $TimeoutMinutes) {
            $process.Kill($true)
            Write-Result 'failed' "Unity exceeded the $TimeoutMinutes minute timeout. See $logPath" 1
            exit 1
        }
    }
    if ($process.ExitCode -eq 198 -and (Test-Path -LiteralPath $logPath) -and
        (Select-String -LiteralPath $logPath -SimpleMatch 'No valid Unity Editor license found' -Quiet)) {
        Write-Result 'license_required' "Unity $detectedVersion is installed but has no active Editor license. Sign in and activate your license in Unity Hub, then retry $Task. Project compilation and build did not run. Log: $logPath" 1
        exit 1
    }
    $engineResultPath = Join-Path $logs 'unity-task-result.json'
    $engineResult = if (Test-Path -LiteralPath $engineResultPath) { Get-Content -Raw -LiteralPath $engineResultPath | ConvertFrom-Json } else { $null }
    # A zero process exit alone is insufficient: licensing/package/command errors can exit before our method.
    if ($process.ExitCode -ne 0 -or !$engineResult -or $engineResult.runId -ne $runId -or !$engineResult.success -or $engineResult.task -ne $Task -or $engineResult.unityVersion -ne $requestedVersion) {
        Write-Result 'failed' "Unity did not confirm successful $Task execution (process exit $($process.ExitCode)). See $logPath" 1
        exit 1
    }
    Write-Result 'passed' "Unity $($engineResult.unityVersion) completed $Task. This does not replace device or multiplayer QA. Log: $logPath" 0
    exit 0
}
catch {
    Write-Result 'failed' $_.Exception.Message 1
    exit 1
}
