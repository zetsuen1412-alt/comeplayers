$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$layout = Join-Path $projectPath 'Assets/CRWT/Scripts/Match/CrwtBoardLayout.cs'
$catalog = Join-Path $projectPath 'Assets/CRWT/Scripts/Match/CrwtTileCatalog.cs'
Add-Type -Path @($layout,$catalog)
$assertions = 0
function Assert-True([bool]$condition, [string]$message) {
    if (!$condition) { throw $message }
    $script:assertions++
}
$positions = [Collections.Generic.HashSet[string]]::new()
for ($tile=0; $tile -lt 32; $tile++) {
    $point = [ComePlayers.CrazyRich.CrwtBoardLayout]::Position($tile)
    Assert-True ($positions.Add("$([Math]::Round($point.X,3)),$([Math]::Round($point.Z,3))")) "Overlapping tile $tile"
    $next = [ComePlayers.CrazyRich.CrwtBoardLayout]::Position($tile+1)
    $dx=[Math]::Abs($next.X-$point.X); $dz=[Math]::Abs($next.Z-$point.Z)
    Assert-True ([Math]::Abs($dx+$dz-1.7) -lt 0.001) "Disconnected edge after tile $tile"
    Assert-True ($dx -lt 0.001 -or $dz -lt 0.001) "Diagonal board edge after tile $tile"
    Assert-True (![ComePlayers.CrazyRich.CrwtBoardLayout]::HasRollPath(1,$tile,$tile,1,$tile,$tile,0,$true)) "Zero creates path at $tile"
    Assert-True ([ComePlayers.CrazyRich.CrwtBoardLayout]::LandingTile($tile,0) -eq $tile) "Zero changes landing tile $tile"
    for ($steps=1; $steps -le 12; $steps++) {
        $to = [ComePlayers.CrazyRich.CrwtBoardLayout]::LandingTile($tile,$steps)
        Assert-True ($to -eq (($tile+$steps)%32)) "Wrong wrapped landing: $tile + $steps"
        Assert-True ([ComePlayers.CrazyRich.CrwtBoardLayout]::HasRollPath(1,$tile,$to,1,$tile,$to,$steps,$false)) 'Server roll path not accepted'
        Assert-True (![ComePlayers.CrazyRich.CrwtBoardLayout]::HasRollPath(2,$tile,$to,1,$tile,$to,$steps,$false)) 'Unrelated pawn moved'
        Assert-True (![ComePlayers.CrazyRich.CrwtBoardLayout]::HasRollPath(1,$tile,$to,1,(($tile+1)%32),$to,$steps,$false)) 'Stale starting tile accepted'
    }
}
Assert-True ($positions.Count -eq 32) 'Board must have 32 unique positions'
Assert-True (![ComePlayers.CrazyRich.CrwtBoardLayout]::HasRollPath(1,5,6,1,5,6,13,$false)) 'Out-of-range movement accepted'
Assert-True (![ComePlayers.CrazyRich.CrwtBoardLayout]::HasRollPath(1,5,6,1,5,6,-1,$false)) 'Negative movement accepted'
Assert-True (![ComePlayers.CrazyRich.CrwtBoardLayout]::HasRollPath(1,5,6,1,5,6,0,$false)) 'Zero without flag starts walking'
Assert-True (![ComePlayers.CrazyRich.CrwtBoardLayout]::HasRollPath(1,5,6,1,5,6,1,$true)) 'Zero flag ignored'
Assert-True ([ComePlayers.CrazyRich.CrwtBoardLayout]::HasRollPath(1,23,4,1,23,4,1,$false)) 'Bot World Travel snapshot must reconcile final destination'
Assert-True ([ComePlayers.CrazyRich.CrwtBoardLayout]::HasRollPath(1,23,23,1,23,23,1,$false)) 'Bot returning to its origin must still animate the nonzero roll path'
Assert-True ([ComePlayers.CrazyRich.CrwtBoardLayout]::Normalize(-1) -eq 31) 'Negative index normalization'
Assert-True ([ComePlayers.CrazyRich.CrwtBoardLayout]::Normalize(32) -eq 0) 'End index normalization'
$fixture = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'fixtures/map-catalog.json') | ConvertFrom-Json
Assert-True ($fixture.tiles.Count -eq 160) 'Expected five maps of 32 tiles'
foreach ($tile in $fixture.tiles) {
    $actual = [ComePlayers.CrazyRich.CrwtTileCatalog]::Get($tile.map_id,$tile.tile_id)
    $group = if ($null -eq $tile.group_id) { -1 } else { $tile.group_id }
    Assert-True ($actual.Name -ceq $tile.name) "Name drift: $($tile.map_id)/$($tile.tile_id)"
    Assert-True ($actual.Kind -ceq $tile.kind) 'Tile type drift'
    Assert-True ($actual.Group -eq $group) 'Ownership group drift'
    Assert-True ($actual.Price -eq $tile.price) 'Catalog price drift'
    Assert-True ($actual.VisualKey -ceq $tile.visual_key) 'Visual metadata drift'
}
"C# board checks: $assertions passed (compiled actual geometry and catalog). Rendering and live input are not exercised."
