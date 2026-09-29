#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace ComePlayers.CrazyRich.Editor
{
    public static class CrwtBoardChecks
    {
        [MenuItem("Crazy Rich/30.0/Check Board Presentation")]
        public static void Run()
        {
            var positions = new HashSet<string>();
            for (int tile = 0; tile < CrwtBoardLayout.TileCount; tile++)
            {
                var point = CrwtBoardLayout.Position(tile);
                Check(positions.Add(Math.Round(point.X, 3) + ":" + Math.Round(point.Z, 3)), "Overlapping tile " + tile);
                var next = CrwtBoardLayout.Position(tile + 1);
                var distance = Math.Abs(next.X - point.X) + Math.Abs(next.Z - point.Z);
                Check(Math.Abs(distance - CrwtBoardLayout.Spacing) < 0.001f, "Disconnected board edge " + tile);
                Check(!CrwtBoardLayout.HasRollPath(1,tile,tile,1,tile,tile,0,true), "Zero roll creates a walking path");
                for (int steps = 1; steps <= 12; steps++)
                {
                    var destination = CrwtBoardLayout.LandingTile(tile, steps);
                    Check(CrwtBoardLayout.HasRollPath(1,tile,destination,1,tile,destination,steps,false), "Valid server path rejected");
                    Check(!CrwtBoardLayout.HasRollPath(2,tile,destination,1,tile,destination,steps,false), "Another player's roll starts walking");
                }
            }
            foreach (var mapId in CrwtRuntimeConfig.MapIds)
                for (int tile = 0; tile < CrwtBoardLayout.TileCount; tile++)
                    Check(!string.IsNullOrWhiteSpace(CrwtTileCatalog.Get(mapId,tile).Name), "Missing tile label");
            Check(CrwtBoardLayout.HasRollPath(1,23,23,1,23,23,1,false), "Bot travel back to its origin hides a nonzero roll path");
            Debug.Log("[CRWT 30] Board geometry, metadata and roll-path checks passed. Rendered device QA is separate.");
        }

        private static void Check(bool condition, string message)
        {
            if (!condition) throw new InvalidOperationException(message);
        }
    }
}
#endif
