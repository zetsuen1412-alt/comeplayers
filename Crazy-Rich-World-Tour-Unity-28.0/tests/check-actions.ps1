$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$sources = @((Join-Path $projectPath 'Assets/CRWT/Scripts/Network/CrwtDtos.cs'), (Join-Path $projectPath 'Assets/CRWT/Scripts/Match/CrwtActionOptions.cs'))
Add-Type -Path $sources -ReferencedAssemblies @([Newtonsoft.Json.JsonConvert].Assembly.Location, 'System.Collections.dll', 'System.Runtime.dll','System.Linq.dll') -CompilerOptions '/nowarn:1701'
$assertions = 0
function Assert-True([bool]$condition, [string]$message) {
    if (!$condition) { throw $message }
    $script:assertions++
}
function New-Snapshot {
    return [Newtonsoft.Json.JsonConvert]::DeserializeObject(@'
{"status":"active","turn_seat":1,"your_seat":2,"spectator":false,"state":{"phase":"auction","pending":{"type":"auction","min_bid":120,"current_bid":140,"high_seat":1,"eligible":[1,2,3],"passed":[]},"players":[{"seat":1,"cash":1000},{"seat":2,"cash":500},{"seat":3,"cash":300}],"properties":{"1":{"owner_seat":2},"31":{"owner_seat":2},"4":{"owner_seat":1},"5":null,"invalid":{"owner_seat":2},"-1":{"owner_seat":2},"32":{"owner_seat":2}}}}
'@, [ComePlayers.CrazyRich.CrwtMatchSnapshot])
}
$snapshot = New-Snapshot
Assert-True ([ComePlayers.CrazyRich.CrwtActionOptions]::CanBid($snapshot)) 'Non-current eligible auction player must be able to bid'
Assert-True ([ComePlayers.CrazyRich.CrwtActionOptions]::CanPass($snapshot)) 'Eligible non-high player can pass'
Assert-True ([ComePlayers.CrazyRich.CrwtActionOptions]::MinimumBid($snapshot.state.pending) -eq 150) 'Next bid must be current + 10'
Assert-True ([ComePlayers.CrazyRich.CrwtActionOptions]::ValidBid($snapshot,150)) 'Minimum bid not accepted'
Assert-True (![ComePlayers.CrazyRich.CrwtActionOptions]::ValidBid($snapshot,149)) 'Below minimum bid accepted'
Assert-True ([ComePlayers.CrazyRich.CrwtActionOptions]::ValidBid($snapshot,500)) 'Exact cash limit not accepted'
Assert-True (![ComePlayers.CrazyRich.CrwtActionOptions]::ValidBid($snapshot,501)) 'Bid exceeding cash accepted'
Assert-True (![ComePlayers.CrazyRich.CrwtActionOptions]::ValidBid($snapshot,-1)) 'Negative bid accepted'
$snapshot.state.pending.min_bid=200
Assert-True ([ComePlayers.CrazyRich.CrwtActionOptions]::MinimumBid($snapshot.state.pending) -eq 200) 'Server minimum bid was ignored'
Assert-True (![ComePlayers.CrazyRich.CrwtActionOptions]::ValidBid($snapshot,150)) 'Bid below server minimum accepted'
$snapshot.state.pending.current_bid=[int]::MaxValue
Assert-True ([ComePlayers.CrazyRich.CrwtActionOptions]::MinimumBid($snapshot.state.pending) -eq [int]::MaxValue) 'Minimum overflowed to a negative number'
$snapshot = New-Snapshot
$snapshot.state.pending.high_seat=2
Assert-True (![ComePlayers.CrazyRich.CrwtActionOptions]::CanPass($snapshot)) 'Highest bidder must not pass'
$snapshot.state.pending.high_seat=$null
Assert-True ([ComePlayers.CrazyRich.CrwtActionOptions]::CanPass($snapshot)) 'Null high seat incorrectly hides pass'
$snapshot.state.pending.passed=@(2)
Assert-True (![ComePlayers.CrazyRich.CrwtActionOptions]::CanBid($snapshot)) 'Passed player can bid'
Assert-True (![ComePlayers.CrazyRich.CrwtActionOptions]::CanPass($snapshot)) 'Passed player can pass again'
$snapshot = New-Snapshot
$snapshot.state.pending.eligible=@(1,3)
Assert-True (![ComePlayers.CrazyRich.CrwtActionOptions]::CanBid($snapshot)) 'Ineligible player can bid'
$snapshot = New-Snapshot
$snapshot.spectator=$true
Assert-True (![ComePlayers.CrazyRich.CrwtActionOptions]::CanBid($snapshot)) 'Spectator can bid'
$snapshot = New-Snapshot
$snapshot.status='finished'
Assert-True (![ComePlayers.CrazyRich.CrwtActionOptions]::CanBid($snapshot)) 'Finished match can bid'
$snapshot = New-Snapshot
$snapshot.state.players[1].bankrupt=$true
Assert-True (![ComePlayers.CrazyRich.CrwtActionOptions]::CanBid($snapshot)) 'Bankrupt player can bid'
$snapshot = New-Snapshot
$snapshot.your_seat=0
Assert-True (![ComePlayers.CrazyRich.CrwtActionOptions]::CanBid($snapshot)) 'Missing seat can bid'
$snapshot = New-Snapshot
$snapshot.state.phase='await_roll'
Assert-True (![ComePlayers.CrazyRich.CrwtActionOptions]::CanBid($snapshot)) 'Non-auction phase can bid'
$snapshot = New-Snapshot
$snapshot.state.pending=$null
Assert-True (![ComePlayers.CrazyRich.CrwtActionOptions]::CanBid($snapshot)) 'Missing pending can bid'
Assert-True (![ComePlayers.CrazyRich.CrwtActionOptions]::CanBid($null)) 'Missing snapshot can bid'
Assert-True ([ComePlayers.CrazyRich.CrwtActionOptions]::MinimumBid($null) -eq 0) 'Null pending must be safe'
$snapshot = New-Snapshot
$owned = [ComePlayers.CrazyRich.CrwtActionOptions]::OwnedTiles($snapshot)
Assert-True (($owned -join ',') -eq '1,31') 'Owned property selection includes other player, invalid or null tiles'
Assert-True ([ComePlayers.CrazyRich.CrwtActionOptions]::OwnedTiles($null).Length -eq 0) 'Null owned state must be safe'
foreach ($kind in @('city','resort')) {
    Assert-True ([ComePlayers.CrazyRich.CrwtActionOptions]::IsTravelKind($kind)) "Valid World Travel kind $kind rejected"
}
foreach ($kind in @('start','chance','bonus','festival','travel','island','tax',$null,'')) {
    Assert-True (![ComePlayers.CrazyRich.CrwtActionOptions]::IsTravelKind($kind)) "Invalid World Travel kind $kind accepted"
}
Assert-True ([ComePlayers.CrazyRich.CrwtActionOptions]::NeedsTarget('swap')) 'Swap card target omitted'
Assert-True ([ComePlayers.CrazyRich.CrwtActionOptions]::NeedsTarget('freeze')) 'Freeze card target omitted'
Assert-True (![ComePlayers.CrazyRich.CrwtActionOptions]::NeedsTarget('shield')) 'Non-target card opens target picker'
"C# action checks: $assertions passed (compiled actual DTOs and action options). Server RPCs remain authoritative."
