using System;

namespace ComePlayers.CrazyRich
{
    // Validation/presentation only. No RNG and no authoritative state mutations.
    public static class CrwtDiceRules
    {
        public static bool IsValid(int a, int b, int total, bool doubles, bool zero, int from, int to)
        {
            return a >= 0 && a <= 6 && b >= 0 && b <= 6
                && total == a + b && doubles == (a == b)
                && zero == (a == 0 && b == 0)
                && from >= 0 && from < 32 && to >= 0 && to < 32
                && (!zero || from == to);
        }

        public static string Caption(int a, int b, int total, bool zero)
        {
            return zero ? "ZERO ROLL!\n0 + 0" : "[" + a + "] + [" + b + "]\nTOTAL " + total;
        }
    }

    // A server roll_id distinguishes consecutive identical rolls. Versions alone
    // cannot: a property decision also increments the match version.
    public sealed class CrwtRollCursor
    {
        private string lastId;
        private bool initialized;
        public long Version { get; private set; } = -1;

        public bool Accept(long version, string rollId, bool explicitlyRequested)
        {
            if (version < Version) return false;
            Version = version;
            bool changed = !string.IsNullOrEmpty(rollId) && rollId != lastId;
            bool reveal = changed && (initialized || explicitlyRequested);
            lastId = rollId;
            initialized = true;
            return reveal;
        }
    }
}
