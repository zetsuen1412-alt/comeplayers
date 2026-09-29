using UnityEngine;

namespace ComePlayers.CrazyRich
{
    public static class CrwtRuntimeConfig
    {
        public const string ClientVersion = "28.0";
        public const string SupabaseUrl = "https://uyehruetoxedmookyfcd.supabase.co";
        public const string SupabasePublishableKey = "sb_publishable_JPf7KbUQ04dOFrpxYjxKJA_MWu1X6Sk";
        public const string ProductName = "Crazy Rich: World Tour";
        public const float MatchPollSeconds = 0.65f;
        public const float RoomPollSeconds = 0.90f;
        public static readonly string[] MapIds = { "world_tour", "tokyo_rush", "tropical_paradise", "candy_world", "fantasy_kingdom" };
        public static readonly string[] MapNames = { "World Tour", "Tokyo Rush", "Tropical Paradise", "Candy World", "Fantasy Kingdom" };

        public static string MapName(string id)
        {
            for (var i = 0; i < MapIds.Length; i++) if (MapIds[i] == id) return MapNames[i];
            return "World Tour";
        }
    }
}
