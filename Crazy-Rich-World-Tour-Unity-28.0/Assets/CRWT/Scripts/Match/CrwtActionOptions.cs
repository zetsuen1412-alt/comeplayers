using System;
using System.Linq;

namespace ComePlayers.CrazyRich
{
    // UI eligibility and suggestions only. Every action is validated by its RPC.
    public static class CrwtActionOptions
    {
        public static bool CanBid(CrwtMatchSnapshot s)
        {
            var p = s?.state?.pending;
            return s != null && s.status == "active" && !s.spectator && s.your_seat > 0
                && s.state.phase == "auction" && p?.type == "auction"
                && (p.eligible?.Contains(s.your_seat) ?? false)
                && !(p.passed?.Contains(s.your_seat) ?? false)
                && (s.state.players?.Any(x => x.seat == s.your_seat && !x.bankrupt) ?? false);
        }
        public static bool CanPass(CrwtMatchSnapshot s) => CanBid(s) && s.state.pending.high_seat != s.your_seat;
        public static int MinimumBid(CrwtPending p) => p == null ? 0 : (int)Math.Min(int.MaxValue, Math.Max((long)p.min_bid, (long)p.current_bid + 10));
        public static bool ValidBid(CrwtMatchSnapshot s, int amount) => CanBid(s)
            && amount >= MinimumBid(s.state.pending)
            && amount <= s.state.players.First(p => p.seat == s.your_seat).cash;
        public static bool IsTravelKind(string kind) => kind == "city" || kind == "resort";
        public static int[] OwnedTiles(CrwtMatchSnapshot s) => s?.state?.properties == null ? Array.Empty<int>() :
            s.state.properties.Where(kv => kv.Value != null && kv.Value.owner_seat == s.your_seat)
                .Select(kv => int.TryParse(kv.Key, out int id) ? id : -1).Where(id => id >= 0 && id < 32).OrderBy(id => id).ToArray();
        public static bool NeedsTarget(string card) => card == "swap" || card == "freeze";
    }
}
