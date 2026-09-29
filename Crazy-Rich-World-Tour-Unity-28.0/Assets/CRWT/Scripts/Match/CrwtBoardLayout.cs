namespace ComePlayers.CrazyRich
{
    /// <summary>Presentation geometry. This class never decides gameplay movement.</summary>
    public static class CrwtBoardLayout
    {
        public const int TileCount = 32;
        public const float Edge = 6.8f;
        public const float Spacing = 1.7f;

        public readonly struct Point
        {
            public readonly float X;
            public readonly float Z;
            public Point(float x, float z) { X = x; Z = z; }
        }

        public static int Normalize(int tile) => ((tile % TileCount) + TileCount) % TileCount;

        public static Point Position(int tile)
        {
            tile = Normalize(tile);
            var offset = (tile % 8) * Spacing;
            switch (tile / 8)
            {
                case 0: return new Point(-Edge + offset, -Edge);
                case 1: return new Point(Edge, -Edge + offset);
                case 2: return new Point(Edge - offset, Edge);
                default: return new Point(-Edge, Edge - offset);
            }
        }

        public static int LandingTile(int from, int steps) => Normalize(from + steps);

        // Only a fresh, prepared server roll authorizes the walking presentation.
        // Its final destination can differ from the landing tile after bot travel.
        public static bool HasRollPath(int seat, int from, int destination,
            int rollSeat, int rollFrom, int rollTo, int rollTotal, bool zeroRoll)
        {
            return !zeroRoll && rollTotal > 0 && rollTotal <= 12 &&
                seat == rollSeat && from == rollFrom && destination == rollTo &&
                from >= 0 && from < TileCount && destination >= 0 && destination < TileCount;
        }
    }
}
