$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
Add-Type -Path (Join-Path $PSHOME 'Microsoft.CodeAnalysis.dll')
Add-Type -Path (Join-Path $PSHOME 'Microsoft.CodeAnalysis.CSharp.dll')
$files = @(Get-ChildItem -LiteralPath (Join-Path $projectPath 'Assets') -Filter '*.cs' -Recurse)
$errors = [Collections.Generic.List[string]]::new()
# Unity 6 uses C# 9. Parse both editor code and the Android/Windows conditional branches.
foreach ($symbols in @(@('UNITY_EDITOR','UNITY_STANDALONE_WIN','UNITY_6000_0_OR_NEWER'),@('UNITY_ANDROID','UNITY_6000_0_OR_NEWER'))) {
    $options = [Microsoft.CodeAnalysis.CSharp.CSharpParseOptions]::Default.WithLanguageVersion([Microsoft.CodeAnalysis.CSharp.LanguageVersion]::CSharp9).WithPreprocessorSymbols([string[]]$symbols)
    foreach ($file in $files) {
        $tree = [Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree]::ParseText([string](Get-Content -Raw -LiteralPath $file.FullName), $options, $file.FullName)
        foreach ($diagnostic in $tree.GetDiagnostics()) {
            if ($diagnostic.Severity -eq [Microsoft.CodeAnalysis.DiagnosticSeverity]::Error) { $errors.Add($diagnostic.ToString()) }
        }
    }
}
if ($errors.Count -gt 0) { throw ($errors -join "`n") }
"C# 9 syntax: $($files.Count) actual source files passed for Editor/Windows and Android. This is syntax parsing only; Unity API compilation and Play Mode require Unity Editor."
