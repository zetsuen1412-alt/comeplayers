using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace ComePlayers.CrazyRich
{
    [Serializable] public sealed class CrwtAuthUser { public string id; public string email; }
    [Serializable] public sealed class CrwtAuthSession
    {
        public string access_token;
        public string refresh_token;
        public int expires_in;
        public string token_type;
        public CrwtAuthUser user;
    }

    [Serializable] public sealed class CrwtRoomCreateResponse
    {
        public string room_id;
        public string code;
        public string name;
        public string status;
        public string map_name;
        public string map_theme;
        public string win_condition;
        public bool ranked;
    }

    [Serializable] public sealed class CrwtRoomEnvelope
    {
        public CrwtRoom room;
        public CrwtRoomMember[] members;
    }

    [Serializable] public sealed class CrwtRoom
    {
        public string id;
        public string name;
        public string code;
        public string host_user_id;
        public string status;
        public string visibility;
        public string mode;
        public string map_id;
        public string win_condition;
        public int max_players;
        public bool bot_fill;
        public bool matchmaking;
        public bool is_ranked;
    }

    [Serializable] public sealed class CrwtRoomMember
    {
        public string id;
        public string user_id;
        public string bot_key;
        public int seat;
        public string display_name;
        public string character_id;
        public bool ready;
        public bool is_host;
        public string connection_status;
        public int ping_ms;
    }

    [Serializable] public sealed class CrwtStartMatchResponse
    {
        public bool ok;
        public string room_id;
        public string match_id;
        public int players;
        public int version;
        public string map_name;
        public string map_theme;
        public string win_condition;
        public bool ranked;
        public CrwtMatchState state;
    }

    [Serializable] public sealed class CrwtActiveMatchResponse { public string match_id; public string status; }
    [Serializable] public sealed class CrwtResumeRoomResponse { public string room_id; }

    [Serializable] public sealed class CrwtMatchSnapshot
    {
        public string match_id;
        public string room_id;
        public string status;
        public int version;
        public int round;
        public int turn_seat;
        public int your_seat;
        public bool current_is_bot;
        public bool is_host;
        public bool ranked;
        public bool spectator;
        public string deadline_at;
        public CrwtMatchState state;
    }

    [Serializable] public sealed class CrwtMatchState
    {
        public string mode;
        public string phase;
        public string map_id;
        public string map_name;
        public string map_theme;
        public string message;
        public string win_condition;
        public int? winner_seat;
        public CrwtPending pending;
        public CrwtPlayer[] players;
        public CrwtLastRoll last_roll;
        public Dictionary<string, CrwtPropertyState> properties;
        public int? festival_group;
        public int festival_until_round;
    }

    [Serializable] public sealed class CrwtPlayer
    {
        public string bot_key;
        public int cash;
        public string name;
        public int seat;
        public string[] cards;
        public string user_id;
        public bool bankrupt;
        public int position;
        public string character_id;
        public int character_level;
        public int dice_level;
    }

    [Serializable] public sealed class CrwtPropertyState
    {
        public int owner_seat;
        public int level;
        public int invested;
    }

    [Serializable] public sealed class CrwtPending
    {
        public string name;
        public string type;
        public string reason;
        public int price;
        public int tile_id;
        public int auction_min;
        public int debt;
        public int high_bid;
        public int high_bidder_seat;
        // Auction fields are named by the existing v15 server contract.
        public int min_bid;
        public int current_bid;
        public int? high_seat;
        public int[] eligible;
        public int[] passed;
    }

    [Serializable] public sealed class CrwtLastRoll
    {
        public string roll_id;
        public bool zero_roll;
        [JsonProperty(Required = Required.Always)]
        public int d1;
        [JsonProperty(Required = Required.Always)]
        public int d2;
        [JsonProperty(Required = Required.Always)]
        public int total;
        public int from;
        public int to;
        public int seat;
        public bool doubles;
        public string tile;
        public string @event;
    }

    [Serializable] public sealed class CrwtProgressionProfile
    {
        public string display_name;
        public int level;
        public int xp;
        public long gold;
        public int diamonds;
        public string character_id;
        public string dice_id;
        public string[] deck;
    }

    [Serializable] public sealed class CrwtProgressionItem
    {
        public string id;
        public string name;
        public string rarity;
        public string skill_name;
        public string description;
        public string effect_type;
        public string unlock_currency;
        public int unlock_cost;
        public int max_level;
        public bool owned;
        public int level;
        public int mastery_xp;
        public int matches_played;
        public int wins;
        public int uses;
    }

    [Serializable] public sealed class CrwtProgressionSystem
    {
        public bool pendant_artifact;
        public bool ranked_progression_normalized;
    }

    [Serializable] public sealed class CrwtProgressionSnapshot
    {
        public CrwtProgressionProfile profile;
        public CrwtProgressionItem[] characters;
        public CrwtProgressionItem[] dice;
        public CrwtProgressionItem[] cards;
        public CrwtProgressionSystem system;
    }

    [Serializable] public sealed class CrwtLobbyEvent
    {
        public string id;
        public string title;
        public string subtitle;
        public string description;
        public string starts_at;
        public string ends_at;
        public string accent;
    }

    [Serializable] public sealed class CrwtMission
    {
        public string id;
        public string event_id;
        public string cadence;
        public string title;
        public string description;
        public string metric;
        public int target;
        public int progress;
        public bool completed;
        public bool claimed;
        public long reward_gold;
        public int reward_diamonds;
        public string period_key;
        public string reset_at;
    }

    [Serializable] public sealed class CrwtEventSnapshot
    {
        public string server_now;
        public string daily_reset_at;
        public string weekly_reset_at;
        public int claimable;
        public CrwtLobbyEvent[] events;
        public CrwtMission[] missions;
    }

    [Serializable] public sealed class CrwtMissionClaimResponse
    {
        public bool ok;
        public string mission_id;
        public string period_key;
        public long reward_gold;
        public int reward_diamonds;
        public CrwtEventSnapshot events;
        public CrwtProgressionSnapshot progression;
    }

    [Serializable] public sealed class CrwtReward { public int gold_reward; public int xp_reward; public int mastery_reward; }
    [Serializable] public sealed class CrwtRankedResult { public int placement; public int rating_before; public int rating_delta; public int rating_after; public string tier_after; }
    [Serializable] public sealed class CrwtResultPlayer { public int seat; public string name; public string character_id; public int cash; public bool bankrupt; public bool winner; }
    [Serializable] public sealed class CrwtMatchResult
    {
        public string match_id;
        public string room_id;
        public string room_name;
        public string map_id;
        public string mode;
        public bool ranked;
        public string status;
        public int winner_seat;
        public int your_seat;
        public bool won;
        public CrwtResultPlayer[] players;
        public CrwtReward reward;
        public CrwtRankedResult ranked_result;
        public string win_condition;
    }

    [Serializable] public sealed class CrwtRematchStatus
    {
        public bool ok;
        public bool ready;
        public string match_id;
        public int yes_votes;
        public bool your_vote;
        public string new_room_id;
        public int human_players;
        public string new_room_code;
    }

    public sealed class CrwtApiException : Exception
    {
        public readonly long StatusCode;
        public CrwtApiException(string message, long statusCode = 0) : base(message) { StatusCode = statusCode; }
    }
}
