$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$rulesPath = Join-Path $project 'Assets/CRWT/Scripts/Match/CrwtDiceRules.cs'
Add-Type -TypeDefinition (Get-Content -Raw -LiteralPath $rulesPath)
$assertions = 0
function Assert-True([bool]$condition, [string]$message) {
    if (!$condition) { throw $message }
    $script:assertions++
}
for ($a=0; $a -le 6; $a++) {
    for ($b=0; $b -le 6; $b++) {
        $total=$a+$b
        Assert-True ([ComePlayers.CrazyRich.CrwtDiceRules]::IsValid($a,$b,$total,($a -eq $b),($total -eq 0),0,$total)) "Valid pair rejected: $a + $b"
    }
}
Assert-True (![ComePlayers.CrazyRich.CrwtDiceRules]::IsValid(-1,1,0,$false,$false,0,0)) 'Negative face accepted'
Assert-True (![ComePlayers.CrazyRich.CrwtDiceRules]::IsValid(7,1,8,$false,$false,0,8)) 'Face seven accepted'
Assert-True (![ComePlayers.CrazyRich.CrwtDiceRules]::IsValid(0,0,0,$true,$true,0,1)) 'Zero movement accepted'
Assert-True (![ComePlayers.CrazyRich.CrwtDiceRules]::IsValid(0,0,0,$false,$true,0,0)) 'Zero without doubles accepted'
Assert-True (![ComePlayers.CrazyRich.CrwtDiceRules]::IsValid(0,5,6,$false,$false,0,6)) 'Incorrect total accepted'
Assert-True ([ComePlayers.CrazyRich.CrwtDiceRules]::Caption(0,5,5,$false) -eq "[0] + [5]`nTOTAL 5") 'Single zero caption'
Assert-True ([ComePlayers.CrazyRich.CrwtDiceRules]::Caption(0,0,0,$true) -eq "ZERO ROLL!`n0 + 0") 'Zero cinematic caption'
$cursor = [ComePlayers.CrazyRich.CrwtRollCursor]::new()
Assert-True (!$cursor.Accept(10,'initial-zero',$false)) 'Reconnect replayed old roll'
Assert-True ($cursor.Accept(11,'next-zero',$false)) 'Consecutive zero missed'
Assert-True (!$cursor.Accept(12,'next-zero',$false)) 'Property/skill snapshot replayed a roll'
Assert-True (!$cursor.Accept(9,'stale-roll',$false)) 'Out-of-order snapshot replayed'
Assert-True ($cursor.Accept(13,'third-zero',$false)) 'New identical roll missed'
$fresh = [ComePlayers.CrazyRich.CrwtRollCursor]::new()
Assert-True ($fresh.Accept(1,'local-request',$true)) 'First requested roll not shown'
Assert-True (!$fresh.Accept(1,'local-request',$true)) 'Duplicate response replayed'
$dtoPath = Join-Path $project 'Assets/CRWT/Scripts/Network/CrwtDtos.cs'
# PowerShell bundles Newtonsoft for .NET 6 and runs on .NET 10 here; suppress
# only that known framework unification warning, not C# compilation errors.
Add-Type -TypeDefinition (Get-Content -Raw -LiteralPath $dtoPath) -ReferencedAssemblies @([Newtonsoft.Json.JsonConvert].Assembly.Location, 'System.Collections.dll', 'System.Runtime.dll') -CompilerOptions '/nowarn:1701'
$parsed = [Newtonsoft.Json.JsonConvert]::DeserializeObject('{"d1":0,"d2":0,"total":0,"zero_roll":true,"doubles":true,"from":5,"to":5}', [ComePlayers.CrazyRich.CrwtLastRoll])
Assert-True ($parsed.d1 -eq 0 -and $parsed.zero_roll -and $parsed.from -eq $parsed.to) 'Zero JSON contract'
$rejected = $false
try { $null = [Newtonsoft.Json.JsonConvert]::DeserializeObject('{"d2":0,"total":0}', [ComePlayers.CrazyRich.CrwtLastRoll]) } catch { $rejected=$true }
Assert-True $rejected 'Missing die must not silently deserialize as zero'
$state = [Newtonsoft.Json.JsonConvert]::DeserializeObject('{"festival_group":null,"winner_seat":null,"last_roll":null}', [ComePlayers.CrazyRich.CrwtMatchState])
Assert-True ($null -eq $state.festival_group -and $null -eq $state.last_roll) 'Nullable server state'
"C# protocol checks: $assertions passed (compiled actual rules and DTOs via Add-Type)."
