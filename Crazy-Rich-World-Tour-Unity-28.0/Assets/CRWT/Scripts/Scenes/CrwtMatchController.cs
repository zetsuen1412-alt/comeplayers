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
        private CrwtDicePresenter dice;
        private readonly CrwtRollCursor rollCursor = new CrwtRollCursor();
        private CrwtMatchSnapshot queuedSnapshot;
        private bool queuedFull;
        private bool choosingFocus;
        private bool resultLoading;
        private bool resultActionsBuilt;
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
            if (Time.unscaledTime >= nextPoll && !polling && !dice.IsPresenting)
            {
                nextPoll = Time.unscaledTime + CrwtRuntimeConfig.MatchPollSeconds;
                RefreshNow();
            }
        }

        private void SetupWorld()
        {
            var boardGo = new GameObject("CRWT_Board"); board = boardGo.AddComponent<CrwtBoardView>(); board.Build(CrwtSession.SelectedMapId);
            board.MovementFinished += Render;
            var lightGo = new GameObject("KeyLight", typeof(Light)); var light = lightGo.GetComponent<Light>(); light.type = LightType.Directional; light.intensity = 1.25f; lightGo.transform.rotation = Quaternion.Euler(50, -35, 0);
            RenderSettings.ambientLight = new Color(.34f,.39f,.50f);
            var camGo = new GameObject("Main Camera", typeof(Camera), typeof(AudioListener), typeof(CrwtCameraOrbit)); camGo.tag = "MainCamera";
            var orbit = camGo.GetComponent<CrwtCameraOrbit>(); orbit.target = board.CameraTarget; orbit.distance = 19f; orbit.yaw = 0; orbit.pitch = 48f;
            camGo.GetComponent<Camera>().fieldOfView = 44f;
        }

        private void SetupHud()
        {
            var canvas = CrwtUi.CreateCanvas("MatchUI");
            dice = gameObject.AddComponent<CrwtDicePresenter>();
            dice.Initialize(canvas.transform);
            dice.ZeroReact += roll => board.ReactToZero(roll.seat);
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
            try { AcceptSnapshot(await CrwtAppRoot.Instance.Api.SnapshotAsync(CrwtSession.MatchId), true); }
            catch (Exception ex) { if (message) message.text = "SYNC ERROR • " + ex.Message; }
            finally { polling = false; }
        }

        private void Render()
        {
            if (snap?.state == null) return;
            if (dice.IsBusy) { RebuildActions(); return; }
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
            if (!CrwtSession.IsGuest && snap.current_is_bot && snap.is_host && snap.status == "active" && snap.state.phase == "await_roll" && !actionBusy && !board.IsMoving && queuedSnapshot == null) BotStep();
            if (snap.status == "finished" || snap.state.phase == "finished") ShowResultActions();
        }

        private void RebuildActions()
        {
            if (snap?.state != null && (snap.status == "finished" || snap.state.phase == "finished") && (resultLoading || resultActionsBuilt)) return;
            CrwtUi.Clear(actions);
            if (snap == null) return;
            if (CrwtSession.IsGuest) { LabelAction("DEMO VISUAL • Login untuk ROLL"); return; }
            if (actionBusy || dice.IsBusy) { LabelAction("Dadu sedang bergulir..."); return; }
            if (board.IsMoving) { LabelAction("Pemain bergerak..."); return; }
            if (snap.status == "finished" || snap.state.phase == "finished") return;
            if (snap.turn_seat != snap.your_seat) { LabelAction("Menunggu pemain lain..."); return; }
            if (snap.state.phase == "await_roll")
            {
                if (choosingFocus)
                {
                    CrwtUi.Button(actions, "GANJIL", () => ApplyFocus("odd"), CrwtUi.Cyan);
                    CrwtUi.Button(actions, "GENAP", () => ApplyFocus("even"), CrwtUi.Gold);
                    CrwtUi.Button(actions, "BATAL", () => { choosingFocus = false; RebuildActions(); }, Color.gray);
                    return;
                }
                CrwtUi.Button(actions, "🎲 ROLL", () => RunAction(() => CrwtAppRoot.Instance.Api.RollAsync(CrwtSession.MatchId), true), CrwtUi.Gold);
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
            if (me?.character_id == "kairo") { choosingFocus = true; RebuildActions(); }
            else RunAction(() => CrwtAppRoot.Instance.Api.UseSkillAsync(CrwtSession.MatchId));
        }

        private void ApplyFocus(string mode)
        {
            choosingFocus = false;
            RunAction(() => CrwtAppRoot.Instance.Api.UseSkillAsync(CrwtSession.MatchId, mode));
        }

        private async void RunAction(Func<System.Threading.Tasks.Task<CrwtMatchSnapshot>> action, bool isRoll = false)
        {
            if (actionBusy || dice.IsBusy || board.IsMoving) return; actionBusy = true;
            if (isRoll) dice.BeginThrow();
            RebuildActions();
            try
            {
                var response = await action();
                if (!this) return;
                if (isRoll && response?.state?.last_roll == null) throw new CrwtApiException("Server belum memberi hasil dadu.");
                AcceptSnapshot(response, false);
                if (isRoll && !dice.IsPresenting) { dice.CancelWaiting(); Render(); }
            }
            catch (Exception ex) { if (this) { dice.CancelWaiting(); message.text = "ACTION ERROR • " + ex.Message; nextPoll = 0; } }
            finally { actionBusy = false; if (this) RebuildActions(); }
        }

        private void AcceptSnapshot(CrwtMatchSnapshot incoming, bool full)
        {
            if (!this || incoming?.state == null || (snap != null && incoming.version < snap.version)) return;
            if (dice.IsPresenting)
            {
                if (queuedSnapshot == null || incoming.version >= queuedSnapshot.version)
                { queuedSnapshot = incoming; queuedFull = full; }
                return;
            }
            if (!full && snap != null)
            {
                incoming.your_seat = snap.your_seat; incoming.is_host = snap.is_host;
                incoming.ranked = snap.ranked; incoming.spectator = snap.spectator;
                incoming.room_id = incoming.room_id ?? snap.room_id;
                incoming.status = incoming.state.phase == "finished" ? "finished" : snap.status;
            }
            if (!full) incoming.current_is_bot = incoming.state.players?.Any(p => p.seat == incoming.turn_seat && !string.IsNullOrEmpty(p.bot_key)) ?? false;
            var roll = incoming.state.last_roll;
            if (roll != null && !CrwtDiceRules.IsValid(roll.d1, roll.d2, roll.total, roll.doubles, roll.zero_roll, roll.from, roll.to))
                throw new CrwtApiException("Hasil dadu server tidak valid. Sinkronisasi ulang diperlukan.");
            // Older history has no roll_id; use its content only for reconnect compatibility.
            string identity = roll == null ? null : roll.roll_id ?? (roll.seat + ":" + roll.d1 + ":" + roll.d2 + ":" + roll.from + ":" + roll.to + ":" + roll.@event);
            bool reveal = rollCursor.Accept(incoming.version, identity, dice.IsBusy);
            snap = incoming;
            if (snap.turn_seat != snap.your_seat || snap.state.phase != "await_roll") choosingFocus = false;
            if (reveal)
            {
                board.PrepareRoll(roll);
                dice.RevealServerRoll(roll, FinishDicePresentation);
                RebuildActions();
            }
            else Render();
        }

        private void FinishDicePresentation()
        {
            // Apply server positions only after Reveal/ZeroReveal. A zero never
            // dispatches a landing action; pending decisions are server fields.
            Render();
            if (queuedSnapshot != null)
            {
                var pendingSnapshot = queuedSnapshot; bool full = queuedFull;
                queuedSnapshot = null; AcceptSnapshot(pendingSnapshot, full);
            }
            nextPoll = 0;
        }

        private async void BotStep()
        {
            if (actionBusy || dice.IsBusy) return; actionBusy = true;
            dice.BeginThrow(); RebuildActions();
            try
            {
                var response = await CrwtAppRoot.Instance.Api.BotStepAsync(CrwtSession.MatchId);
                if (!this) return;
                if (response?.state?.last_roll == null) throw new CrwtApiException("Server belum memberi hasil dadu bot.");
                AcceptSnapshot(response, false);
                if (!dice.IsPresenting) { dice.CancelWaiting(); Render(); }
            }
            catch (Exception ex) { if (this) { dice.CancelWaiting(); message.text = "BOT • " + ex.Message; } }
            finally { actionBusy = false; if (this) RebuildActions(); }
        }

        private async void ShowResultActions()
        {
            if (resultActionsBuilt || resultLoading || dice.IsBusy || board.IsMoving || actionBusy) return;
            resultLoading = true;
            CrwtUi.Clear(actions);
            try
            {
                var result = await CrwtAppRoot.Instance.Api.MatchResultAsync(CrwtSession.MatchId);
                if (!this) return;
                message.text = (result.won ? "🏆 WINNER" : "MATCH SELESAI") + " • +" + (result.reward?.gold_reward ?? 0) + " Gold • +" + (result.reward?.xp_reward ?? 0) + " XP";
            }
            catch { }
            if (!this) return;
            CrwtUi.Button(actions, "🔁 REMATCH", VoteRematch, CrwtUi.Gold);
            CrwtUi.Button(actions, "LOBBY", ExitMatch, new Color(.70f,.72f,.78f));
            resultActionsBuilt = true;
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
