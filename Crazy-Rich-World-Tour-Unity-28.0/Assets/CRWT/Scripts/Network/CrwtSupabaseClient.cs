using System;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using UnityEngine;
using UnityEngine.Networking;

namespace ComePlayers.CrazyRich
{
    public sealed class CrwtSupabaseClient
    {
        private static string Idem(string prefix) => prefix + "-" + Guid.NewGuid().ToString("N");

        public async Task<CrwtAuthSession> SignInAsync(string email, string password)
        {
            var body = JsonConvert.SerializeObject(new { email, password });
            var data = await SendAsync("POST", "/auth/v1/token?grant_type=password", body, false);
            var session = JsonConvert.DeserializeObject<CrwtAuthSession>(data);
            ApplySession(session);
            return session;
        }

        public async Task<CrwtAuthSession> SignUpAsync(string email, string password)
        {
            var body = JsonConvert.SerializeObject(new { email, password });
            var data = await SendAsync("POST", "/auth/v1/signup", body, false);
            var session = JsonConvert.DeserializeObject<CrwtAuthSession>(data);
            if (!string.IsNullOrEmpty(session?.access_token)) ApplySession(session);
            return session;
        }

        public async Task<bool> RefreshSessionAsync()
        {
            if (string.IsNullOrEmpty(CrwtSession.RefreshToken)) return false;
            try
            {
                var body = JsonConvert.SerializeObject(new { refresh_token = CrwtSession.RefreshToken });
                var data = await SendAsync("POST", "/auth/v1/token?grant_type=refresh_token", body, false, false);
                var session = JsonConvert.DeserializeObject<CrwtAuthSession>(data);
                if (string.IsNullOrEmpty(session?.access_token)) return false;
                ApplySession(session);
                return true;
            }
            catch { return false; }
        }

        private static void ApplySession(CrwtAuthSession session)
        {
            if (session == null) return;
            CrwtSession.AccessToken = session.access_token;
            CrwtSession.RefreshToken = session.refresh_token;
            CrwtSession.UserId = session.user?.id;
            CrwtSession.Email = session.user?.email;
            CrwtSession.IsGuest = false;
        }

        public async Task SignOutAsync()
        {
            if (CrwtSession.IsOnline)
            {
                try { await SendAsync("POST", "/auth/v1/logout", "{}", true); }
                catch { /* local sign-out must still succeed */ }
            }
            CrwtSession.ClearAuth();
        }

        public Task<string> RpcRawAsync(string rpcName, object args = null)
        {
            return SendAsync("POST", "/rest/v1/rpc/" + rpcName, JsonConvert.SerializeObject(args ?? new { }), true);
        }

        public async Task<T> RpcAsync<T>(string rpcName, object args = null)
        {
            var json = await RpcRawAsync(rpcName, args);
            return JsonConvert.DeserializeObject<T>(json);
        }

        public Task<string> BootstrapProgressionAsync() => RpcRawAsync("crwt_progression_bootstrap");
        public Task<string> ProgressionSnapshotAsync() => RpcRawAsync("crwt_progression_snapshot");

        public Task<CrwtRoomCreateResponse> CreateRoomAsync(string name, string mode, string mapId, int maxPlayers, string visibility, bool botFill) =>
            RpcAsync<CrwtRoomCreateResponse>("crwt_create_room_v18", new { p_name = name, p_mode = mode, p_map_id = mapId, p_max_players = maxPlayers, p_visibility = visibility, p_bot_fill = botFill });

        public Task<CrwtRoomCreateResponse> QuickMatchAsync(int targetSize, string mode, string mapId, bool ranked) =>
            RpcAsync<CrwtRoomCreateResponse>("crwt_quick_match_v18", new { p_target_size = targetSize, p_mode = mode, p_map_id = mapId, p_ranked = ranked });

        public Task<CrwtRoomCreateResponse> JoinRoomAsync(string code) => RpcAsync<CrwtRoomCreateResponse>("crwt_join_room", new { p_code = code });
        public Task<CrwtRoomEnvelope> GetRoomAsync(string roomId) => RpcAsync<CrwtRoomEnvelope>("crwt_get_room", new { p_room_id = roomId });
        public Task<CrwtResumeRoomResponse> ResumeRoomAsync() => RpcAsync<CrwtResumeRoomResponse>("crwt_resume_room");
        public Task<string> SetReadyAsync(string roomId, bool ready) => RpcRawAsync("crwt_set_ready", new { p_room_id = roomId, p_ready = ready });
        public Task<string> AddBotAsync(string roomId) => RpcRawAsync("crwt_add_bot", new { p_room_id = roomId });
        public Task<string> LeaveRoomAsync(string roomId) => RpcRawAsync("crwt_leave_room", new { p_room_id = roomId });
        public Task<CrwtStartMatchResponse> StartMatchAsync(string roomId) => RpcAsync<CrwtStartMatchResponse>("crwt_start_match_v18", new { p_room_id = roomId });
        public Task<CrwtActiveMatchResponse> ActiveMatchForRoomAsync(string roomId) => RpcAsync<CrwtActiveMatchResponse>("crwt_active_match_for_room", new { p_room_id = roomId });
        public Task<string> TouchPresenceAsync(string roomId) => RpcRawAsync("crwt_touch_presence", new { p_room_id = roomId });

        public Task<CrwtMatchSnapshot> SnapshotAsync(string matchId) => RpcAsync<CrwtMatchSnapshot>("crwt_v16_snapshot", new { p_match_id = matchId });
        public Task<CrwtMatchSnapshot> RollAsync(string matchId) => RpcAsync<CrwtMatchSnapshot>("crwt_v18_roll", new { p_match_id = matchId, p_idempotency_key = Idem("roll28") });
        public Task<CrwtMatchSnapshot> BuyAsync(string matchId) => ActionAsync("crwt_v15_buy_property", matchId, "buy28");
        public Task<CrwtMatchSnapshot> UpgradeAsync(string matchId) => ActionAsync("crwt_v15_upgrade_property", matchId, "upgrade28");
        public Task<CrwtMatchSnapshot> TakeoverAsync(string matchId) => ActionAsync("crwt_v15_takeover", matchId, "takeover28");
        public Task<CrwtMatchSnapshot> SkipAsync(string matchId) => ActionAsync("crwt_v15_skip_decision", matchId, "skip28");
        public Task<CrwtMatchSnapshot> StartAuctionAsync(string matchId) => ActionAsync("crwt_v15_start_auction", matchId, "auction28");
        public Task<CrwtMatchSnapshot> AuctionPassAsync(string matchId) => ActionAsync("crwt_v15_auction_pass", matchId, "pass28");
        public Task<CrwtMatchSnapshot> DeclareBankruptcyAsync(string matchId) => ActionAsync("crwt_v15_declare_bankruptcy", matchId, "bankrupt28");

        public Task<CrwtMatchSnapshot> AuctionBidAsync(string matchId, int amount) =>
            RpcAsync<CrwtMatchSnapshot>("crwt_v15_auction_bid", new { p_match_id = matchId, p_amount = amount, p_idempotency_key = Idem("bid28") });

        public Task<CrwtMatchSnapshot> SellAssetAsync(string matchId, int tileId) =>
            RpcAsync<CrwtMatchSnapshot>("crwt_v15_sell_asset", new { p_match_id = matchId, p_tile_id = tileId, p_idempotency_key = Idem("sell28") });

        public Task<CrwtMatchSnapshot> TravelAsync(string matchId, int tileId) =>
            RpcAsync<CrwtMatchSnapshot>("crwt_v18_travel_to", new { p_match_id = matchId, p_tile_id = tileId, p_idempotency_key = Idem("travel28") });

        public Task<CrwtMatchSnapshot> FestivalAsync(string matchId, int groupId) =>
            RpcAsync<CrwtMatchSnapshot>("crwt_v18_choose_festival", new { p_match_id = matchId, p_group_id = groupId, p_idempotency_key = Idem("festival28") });

        public Task<CrwtMatchSnapshot> UseSkillAsync(string matchId, string mode = null) =>
            RpcAsync<CrwtMatchSnapshot>("crwt_use_skill_v17", new { p_match_id = matchId, p_mode = mode, p_idempotency_key = Idem("skill28") });

        public Task<CrwtMatchSnapshot> UseCardAsync(string matchId, string card, int? targetSeat = null) =>
            RpcAsync<CrwtMatchSnapshot>("crwt_use_card_v17", new { p_match_id = matchId, p_card = card, p_target_seat = targetSeat, p_idempotency_key = Idem("card28") });

        public Task<CrwtMatchSnapshot> TimeoutTickAsync(string matchId) =>
            RpcAsync<CrwtMatchSnapshot>("crwt_v18_timeout_tick", new { p_match_id = matchId, p_idempotency_key = Idem("timeout28") });

        public Task<CrwtMatchSnapshot> BotStepAsync(string matchId) =>
            RpcAsync<CrwtMatchSnapshot>("crwt_v18_bot_step", new { p_match_id = matchId, p_idempotency_key = Idem("bot28") });

        public Task<CrwtMatchResult> MatchResultAsync(string matchId) => RpcAsync<CrwtMatchResult>("crwt_match_result_v27", new { p_match_id = matchId });
        public Task<CrwtRematchStatus> RematchStatusAsync(string matchId) => RpcAsync<CrwtRematchStatus>("crwt_rematch_status_v27", new { p_match_id = matchId });
        public Task<CrwtRematchStatus> VoteRematchAsync(string matchId, bool wants = true) => RpcAsync<CrwtRematchStatus>("crwt_vote_rematch_v27", new { p_match_id = matchId, p_wants_rematch = wants });

        private Task<CrwtMatchSnapshot> ActionAsync(string rpc, string matchId, string key) =>
            RpcAsync<CrwtMatchSnapshot>(rpc, new { p_match_id = matchId, p_idempotency_key = Idem(key) });

        private async Task<string> SendAsync(string method, string path, string body, bool authorized, bool retryAuth = true)
        {
            var url = CrwtRuntimeConfig.SupabaseUrl.TrimEnd('/') + path;
            using var request = new UnityWebRequest(url, method);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body ?? "{}"));
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("apikey", CrwtRuntimeConfig.SupabasePublishableKey);
            if (authorized)
            {
                if (string.IsNullOrEmpty(CrwtSession.AccessToken)) throw new CrwtApiException("Sesi login tidak tersedia.");
                request.SetRequestHeader("Authorization", "Bearer " + CrwtSession.AccessToken);
            }

            var op = request.SendWebRequest();
            while (!op.isDone) await Task.Yield();
            var text = request.downloadHandler?.text ?? string.Empty;
            if (request.result != UnityWebRequest.Result.Success)
            {
                if (authorized && retryAuth && request.responseCode == 401 && await RefreshSessionAsync())
                    return await SendAsync(method, path, body, true, false);
                var message = ExtractApiError(text);
                throw new CrwtApiException(string.IsNullOrEmpty(message) ? request.error : message, request.responseCode);
            }
            return text;
        }

        private static string ExtractApiError(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return null;
            try
            {
                var obj = JsonConvert.DeserializeObject<Newtonsoft.Json.Linq.JObject>(json);
                return (string)(obj?["message"] ?? obj?["error_description"] ?? obj?["hint"] ?? obj?["error"]);
            }
            catch { return json.Length > 180 ? json.Substring(0, 180) : json; }
        }
    }
}
