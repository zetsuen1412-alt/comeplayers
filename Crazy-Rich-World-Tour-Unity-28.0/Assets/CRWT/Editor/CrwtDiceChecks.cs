#if UNITY_EDITOR
using System;
using Newtonsoft.Json;
using UnityEditor;
using UnityEngine;

namespace ComePlayers.CrazyRich.Editor
{
    public static class CrwtDiceChecks
    {
        [MenuItem("Crazy Rich/29.0/Check Dice Protocol")]
        public static void Run()
        {
            for (int a = 0; a <= 6; a++) for (int b = 0; b <= 6; b++)
                Check(CrwtDiceRules.IsValid(a,b,a+b,a==b,a+b==0,0,a+b), "Valid dice pair rejected");
            Check(!CrwtDiceRules.IsValid(0,0,0,true,true,0,1), "Zero may not move");
            Check(!CrwtDiceRules.IsValid(7,0,7,false,false,0,7), "Out of range accepted");
            var roll = JsonConvert.DeserializeObject<CrwtLastRoll>("{\"d1\":0,\"d2\":0,\"total\":0,\"from\":5,\"to\":5,\"zero_roll\":true,\"doubles\":true}");
            Check(roll.zero_roll && roll.doubles && roll.from == roll.to, "Zero contract failed");
            bool missingRejected = false;
            try { JsonConvert.DeserializeObject<CrwtLastRoll>("{\"d2\":0,\"total\":0}"); }
            catch (JsonSerializationException) { missingRejected = true; }
            Check(missingRejected, "Missing die was incorrectly interpreted as zero");
            var cursor = new CrwtRollCursor();
            Check(!cursor.Accept(3,"old",false), "Reconnect replays history");
            Check(cursor.Accept(4,"zero-a",false), "First zero hidden");
            Check(!cursor.Accept(5,"zero-a",false), "Repeated snapshot animates again");
            Check(cursor.Accept(6,"zero-b",false), "Consecutive zero hidden");
            Check(!cursor.Accept(2,"stale",false), "Out of order snapshot accepted");
            Debug.Log("[CRWT 29] Dice protocol checks passed. Device animation QA is separate.");
        }
        private static void Check(bool condition, string message)
        {
            if (!condition) throw new InvalidOperationException(message);
        }
    }
}
#endif
