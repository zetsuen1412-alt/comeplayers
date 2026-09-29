using System;
using System.Linq;
using System.Text;
using UnityEngine;
using UnityEngine.UI;

namespace ComePlayers.CrazyRich
{
    public sealed class CrwtMatchController : MonoBehaviour
    {
        private CrwtBoardView board;
        private Text header;
        private Text message;
        private Text players;
        private RectTransform actions;
        private float nextPoll;
        private bool polling;
        private bool actionBusy;
        private CrwtMatchSnapshot snap;
        private int demoTile;
        private bool resultLoading;
        private bool rematchVoted;
        private float nextRematchPoll;

        private void Start()
        {
            SetupWorld();
            SetupHud();
            if (CrwtSession.IsGuest) SetupDemo();
            else RefreshNow();
        }

        private void Update()
        {
            if (CrwtSession.IsGuest || string.IsNullOrEmpty(CrwtSession.MatchId)) return;
            if (rematchVoted && Time.unscaledTime >= nextRematchPoll)
            {
                nextRematchPoll = Time.unscaledTime + 1f;
                PollRematch();
            }
            if (Time.unscaledTime >= nextPoll && !polling)
            {
                nextPoll = Time.unscaledTime + CrwtRuntimeConfig.MatchPollSeconds;
                RefreshNow();
            }
        }

        private void SetupWorld()
        {
            var boardGo = new GameObject("CRWT_Board"); board = boardGo.AddComponent<CrwtBoardView>(); board.Build(CrwtSession.SelectedMapId);
            var lightGo = new GameObject("KeyLight", typeof(Light)); var light = lightGo.GetComponent<Light>(); light.type = LightType.Directional; light.intensity = 1.25f; lightGo.transform.rotation = Quaternion.Euler(50, -35, 0);
            RenderSettings.ambientLight = new Color(.34f,.39f,.50f);
            var camGo = new GameObject("Main Camera", typeof(Camera), typeof(AudioListener), typeof(CrwtCameraOrbit)); camGo.tag = "MainCamera";
            var orbit = camGo.GetComponent<CrwtCameraOrbit>(); orbit.target = board.CameraTarget; orbit.distance = 19f; orbit.yaw = 0; orbit.pitch = 48f;
            camGo.GetComponent<Camera>().fieldOfView = 44f;
        }

        private void SetupHud()
        {
            var canvas = CrwtUi.CreateCanvas("MatchUI");
            var top = CrwtUi.Panel(canvas.transform, "Top", new Color(.02f,.03f,.06f,.90f), new Vector2(0,.88f), Vector2.one, Vector2.zero, Vector2.zero);
            header = CrwtUi.Text(top, "CRAZY RICH • CONNECTING", 27, TextAnchor.MiddleLeft, CrwtUi.Gold);
            header.rectTransform.anchorMin = new Vector2(0,0); header.rectTransform.anchorMax = new Vector2(.62f,1); header.rectTransform.offsetMin = new Vector2(28,0); header.rectTransform.offsetMax = Vector2.zero;
            message = CrwtUi.Text(top, "Server-authoritative match", 21, TextAnchor.MiddleRight, Color.white);
            message.rectTransform.anchorMin = new Vector2(.55f,0); message.rectTransform.anchorMax = Vector2.one; message.rectTransform.offsetMin = Vector2.zero; message.rectTransform.offsetMax = new Vector2(-28,0);

            var playerPanel = CrwtUi.Panel(canvas.transform, "Players", new Color(.02f,.03f,.06f,.80f), new Vector2(.01f,.17f), new Vector2(.25f,.86f), Vector2.zero, Vector2.zero);
            players = CrwtUi.Text(playerPanel, "", 20, TextAnchor.UpperLeft, Color.white); CrwtUi.Fill(players.rectTransform, 22);

            actions = CrwtUi.Panel(canvas.transform, "Actions", new Color(.02f,.03f,.06f,.88f), new Vector2(.30f,.01f), new Vector2(.70f,.17f), Vector2.zero, Vector2.zero);
            CrwtUi.Horizontal(actions, 10);

            var exit = CrwtUi.Button(canvas.transform, "LOBBY", ExitMatch, new Color(.65f,.68f,.75f), 56);
            var rt = exit.GetComponent<RectTransform>(); rt.anchorMin = new Vector2(.88f,.91f); rt.anchorMax = new Vector2(.99f,.98f); rt.offsetMin = rt.offsetMax = Vector2.zero;
        }

        private void SetupDemo()
        {
            CrwtSession.SelectedMapId = string.IsNullOrEmpty(CrwtSession.SelectedMapId) ? "world_tour" : CrwtSession.SelectedMapId;
            snap = new CrwtMatchSnapshot
            {
                status = "active", round = 1, turn_seat = 1, your_seat = 1, version = 28,
                state = new CrwtMatchState
                {
                    phase = "await_roll", map_id = CrwtSession.SelectedMapId, map_name = CrwtRuntimeConfig.MapName(CrwtSession.SelectedMapId), win_condition = "bankruptcy",
                    message = "DEMO OFFLINE • visual client only",
                    players = new[] {
                        new CrwtPlayer { seat=1,name=CrwtSession.DisplayName,character_id="alexia",cash=2000,position=0 },
                        new CrwtPlayer { seat=2,name="Rindi",character_id="rindi",cash=2000,position=0 },
                        new CrwtPlayer { seat=3,name="Kairo",character_id="kairo",cash=2000,position=0 },
                        new CrwtPlayer { seat=4,name="Luna",character_id="luna",cash=2000,position=0 }
                    }
                }
            };
            board.Build(snap.state.map_id); Render();
        }

        private async void RefreshNow()
        {
            if (polling) return; polling = true;
            try { snap = await CrwtAppRoot.Instance.Api.SnapshotAsync(CrwtSession.MatchId); Render(); }
            catch (Exception ex) { if (message) message.text = "SYNC ERROR • " + ex.Message; }
            finally { polling = false; }
        }

        private void Render()
        {
            if (snap?.state == null) return;
            if (CrwtSession.SelectedMapId != snap.state.map_id && !string.IsNullOrEmpty(snap.state.map_id))
            {
                CrwtSession.SelectedMapId = snap.state.map_id; board.Build(snap.state.map_id);
            }
            board.Apply(snap);
            header.text = CrwtRuntimeConfig.MapName(snap.state.map_id) + " • PUTARAN " + snap.round + " • GILIRAN " + snap.turn_seat + " • LAST PLAYER STANDING";
            message.text = snap.state.message ?? snap.state.last_roll?.@event ?? "ONLINE";
            var sb = new StringBuilder();
            foreach (var p in snap.state.players ?? Array.Empty<CrwtPlayer>()) sb.AppendLine((p.seat == snap.turn_seat ? "▶ " : "  ") + "S" + p.seat + "  " + p.name + "\n     " + p.cash + "K • Tile " + p.position + (p.bankrupt ? " • BANKRUPT" : ""));
            players.text = sb.ToString();
            RebuildActions();
            if (!CrwtSession.IsGuest && snap.current_is_bot && snap.is_host && snap.status == "active" && snap.state.phase == "await_roll" && !actionBusy) BotStep();
            if (snap.status == "finished" || snap.state.phase == "finished") ShowResultActions();
        }

        private void RebuildActions()
        {
            CrwtUi.Clear(actions);
            if (snap == null) return;
            if (CrwtSession.IsGuest) { CrwtUi.Button(actions, "🎲 ROLL DEMO", DemoRoll, CrwtUi.Gold); return; }
            if (snap.status == "finished" || snap.state.phase == "finished") return;
            if (snap.turn_seat != snap.your_seat) { LabelAction("Menunggu pemain lain..."); return; }
            if (snap.state.phase == "await_roll")
            {
                CrwtUi.Button(actions, "🎲 ROLL", () => RunAction(() => CrwtAppRoot.Instance.Api.RollAsync(CrwtSession.MatchId)), CrwtUi.Gold);
                CrwtUi.Button(actions, "⭐ SKILL", UseSkill, CrwtUi.Cyan);
                return;
            }
            var p = snap.state.pending;
            if (snap.state.phase == "decision" && p != null)
            {
                switch (p.type)
                {
                    case "buy":
                        CrwtUi.Button(actions, "BELI " + p.price + "K", () => RunAction(() => CrwtAppRoot.Instance.Api.BuyAsync(CrwtSession.MatchId)), CrwtUi.Gold);
                        CrwtUi.Button(actions, "LELANG", () => RunAction(() => CrwtAppRoot.Instance.Api.StartAuctionAsync(CrwtSession.MatchId)), CrwtUi.Cyan);
                        break;
                    case "upgrade": CrwtUi.Button(actions, "UPGRADE", () => RunAction(() => CrwtAppRoot.Instance.Api.UpgradeAsync(CrwtSession.MatchId)), CrwtUi.Gold); break;
                    case "takeover": CrwtUi.Button(actions, "TAKEOVER", () => RunAction(() => CrwtAppRoot.Instance.Api.TakeoverAsync(CrwtSession.MatchId)), CrwtUi.Gold); break;
                    case "festival":
                        for (var g=0;g<4;g++) { var gi=g; CrwtUi.Button(actions, "D"+g, () => RunAction(() => CrwtAppRoot.Instance.Api.FestivalAsync(CrwtSession.MatchId, gi)), CrwtUi.Cyan); }
                        return;
                    case "travel":
                        var me = snap.state.players?.FirstOrDefault(x => x.seat == snap.your_seat); var target = ((me?.position ?? 0) + 8) % 32;
                        CrwtUi.Button(actions, "TRAVEL → " + target, () => RunAction(() => CrwtAppRoot.Instance.Api.TravelAsync(CrwtSession.MatchId, target)), CrwtUi.Cyan);
                        break;
                }
                CrwtUi.Button(actions, "LEWATI", () => RunAction(() => CrwtAppRoot.Instance.Api.SkipAsync(CrwtSession.MatchId)), new Color(.70f,.72f,.78f));
                return;
            }
            if (snap.state.phase == "auction")
            {
                var amount = Math.Max(1, p?.auction_min ?? 1);
                CrwtUi.Button(actions, "BID " + amount + "K", () => RunAction(() => CrwtAppRoot.Instance.Api.AuctionBidAsync(CrwtSession.MatchId, amount)), CrwtUi.Gold);
                CrwtUi.Button(actions, "PASS", () => RunAction(() => CrwtAppRoot.Instance.Api.AuctionPassAsync(CrwtSession.MatchId)), new Color(.70f,.72f,.78f));
                return;
            }
            if (snap.state.phase == "liquidation")
            {
                if (snap.state.properties != null)
                {
                    var own = snap.state.properties.FirstOrDefault(x => x.Value != null && x.Value.owner_seat == snap.your_seat);
                    if (!string.IsNullOrEmpty(own.Key) && int.TryParse(own.Key, out var tile)) CrwtUi.Button(actions, "JUAL TILE " + tile, () => RunAction(() => CrwtAppRoot.Instance.Api.SellAssetAsync(CrwtSession.MatchId, tile)), CrwtUi.Gold);
                }
                CrwtUi.Button(actions, "BANGKRUT", () => RunAction(() => CrwtAppRoot.Instance.Api.DeclareBankruptcyAsync(CrwtSession.MatchId)), CrwtUi.Danger);
                return;
            }
            LabelAction("Sinkronisasi server...");
        }

        private void UseSkill()
        {
            var me = snap?.state?.players?.FirstOrDefault(x => x.seat == snap.your_seat);
            if (me?.character_id == "kairo") RunAction(() => CrwtAppRoot.Instance.Api.UseSkillAsync(CrwtSession.MatchId, "odd"));
            else RunAction(() => CrwtAppRoot.Instance.Api.UseSkillAsync(CrwtSession.MatchId));
        }

        private async void RunAction(Func<System.Threading.Tasks.Task<CrwtMatchSnapshot>> action)
        {
            if (actionBusy) return; actionBusy = true;
            try { MergeAction(await action()); Render(); }
            catch (Exception ex) { message.text = "ACTION ERROR • " + ex.Message; }
            finally { actionBusy = false; }
        }

        private void MergeAction(CrwtMatchSnapshot incoming)
        {
            if (incoming == null) return;
            if (snap == null) { snap = incoming; return; }
            if (incoming.state != null) snap.state = incoming.state;
            if (incoming.version > 0) snap.version = incoming.version;
            if (incoming.round > 0) snap.round = incoming.round;
            if (incoming.turn_seat > 0) snap.turn_seat = incoming.turn_seat;
            if (incoming.your_seat > 0) snap.your_seat = incoming.your_seat;
            if (!string.IsNullOrEmpty(incoming.status)) snap.status = incoming.status;
            if (!string.IsNullOrEmpty(incoming.deadline_at)) snap.deadline_at = incoming.deadline_at;
            if (!string.IsNullOrEmpty(incoming.match_id)) snap.match_id = incoming.match_id;
            if (!string.IsNullOrEmpty(incoming.room_id)) snap.room_id = incoming.room_id;
        }

        private async void BotStep()
        {
            if (actionBusy) return; actionBusy = true;
            try { MergeAction(await CrwtAppRoot.Instance.Api.BotStepAsync(CrwtSession.MatchId)); Render(); }
            catch (Exception ex) { message.text = "BOT • " + ex.Message; }
            finally { actionBusy = false; }
        }

        private void DemoRoll()
        {
            demoTile = (demoTile + UnityEngine.Random.Range(2, 13)) % 32;
            snap.state.players[0].position = demoTile;
            snap.state.message = "DEMO • Alexia bergerak ke tile " + demoTile;
            board.Apply(snap); Render();
        }

        private async void ShowResultActions()
        {
            if (actions.childCount > 0 || resultLoading) return;
            resultLoading = true;
            try
            {
                var result = await CrwtAppRoot.Instance.Api.MatchResultAsync(CrwtSession.MatchId);
                message.text = (result.won ? "🏆 WINNER" : "MATCH SELESAI") + " • +" + (result.reward?.gold_reward ?? 0) + " Gold • +" + (result.reward?.xp_reward ?? 0) + " XP";
            }
            catch { }
            CrwtUi.Button(actions, "🔁 REMATCH", VoteRematch, CrwtUi.Gold);
            CrwtUi.Button(actions, "LOBBY", ExitMatch, new Color(.70f,.72f,.78f));
            resultLoading = false;
        }

        private async void VoteRematch()
        {
            try
            {
                var r = await CrwtAppRoot.Instance.Api.VoteRematchAsync(CrwtSession.MatchId, true);
                if (!string.IsNullOrEmpty(r.new_room_id))
                {
                    CrwtSession.RoomId = r.new_room_id; CrwtSession.MatchId = null; CrwtAppRoot.Instance.LoadLobby();
                }
                else
                {
                    rematchVoted = true; nextRematchPoll = Time.unscaledTime + 1f;
                    message.text = "REMATCH • " + r.yes_votes + "/" + r.human_players + " setuju";
                }
            }
            catch (Exception ex) { message.text = ex.Message; }
        }

        private async void PollRematch()
        {
            if (!rematchVoted || string.IsNullOrEmpty(CrwtSession.MatchId)) return;
            try
            {
                var r = await CrwtAppRoot.Instance.Api.RematchStatusAsync(CrwtSession.MatchId);
                if (!string.IsNullOrEmpty(r.new_room_id))
                {
                    rematchVoted = false; CrwtSession.RoomId = r.new_room_id; CrwtSession.MatchId = null; CrwtAppRoot.Instance.LoadLobby();
                }
                else message.text = "REMATCH • " + r.yes_votes + "/" + r.human_players + " setuju";
            }
            catch (Exception ex) { message.text = "REMATCH • " + ex.Message; }
        }

        private void ExitMatch()
        {
            CrwtSession.ClearMatch();
            CrwtAppRoot.Instance.LoadLobby();
        }

        private void LabelAction(string text)
        {
            var t = CrwtUi.Text(actions, text, 22, TextAnchor.MiddleCenter, Color.white); t.gameObject.AddComponent<LayoutElement>().preferredWidth = 520;
        }
    }
}
