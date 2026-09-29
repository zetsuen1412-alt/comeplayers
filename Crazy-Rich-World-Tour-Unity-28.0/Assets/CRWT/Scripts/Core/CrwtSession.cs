namespace ComePlayers.CrazyRich
{
    public static class CrwtSession
    {
        public static string AccessToken;
        public static string RefreshToken;
        public static string UserId;
        public static string Email;
        public static string DisplayName = "Player";
        public static string RoomId;
        public static string MatchId;
        public static string SelectedMapId = "world_tour";
        public static bool IsGuest;

        public static bool IsOnline => !IsGuest && !string.IsNullOrEmpty(AccessToken);

        public static void ClearMatch()
        {
            MatchId = null;
        }

        public static void ClearRoomAndMatch()
        {
            RoomId = null;
            MatchId = null;
        }

        public static void ClearAuth()
        {
            AccessToken = null;
            RefreshToken = null;
            UserId = null;
            Email = null;
            RoomId = null;
            MatchId = null;
            IsGuest = false;
        }
    }
}
