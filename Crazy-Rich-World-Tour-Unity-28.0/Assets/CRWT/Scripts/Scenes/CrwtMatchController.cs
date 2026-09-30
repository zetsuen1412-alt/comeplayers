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
        private Text activePlayer;
        private Text clockLabel;
        private RawImage portrait;
        private RectTransform playerPanel;
        private RectTransform resultBanner;
        private Text resultTitle;
        private Text resultSubtitle;
        private CrwtActionSheet sheet;
        private CrwtAudio sound;
        private CrwtCameraOrbit orbit;
        private Camera sceneCamera;
        private bool syncFailed;
        private bool timeoutBusy;
        private float nextTimeoutCheck;
        private bool rematchPolling;
        private bool rematchRequest;
        private string actionSignature;
        private string pendingCue;
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
            UpdateDeadline();
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
            var lightGo = new GameObject("KeyLight", typeof(Light)); var light = lightGo.GetComponent<Light>();
            light.type = LightType.Directional; light.intensity = 1.18f; light.color = new Color(1f,.94f,.84f); lightGo.transform.rotation = Quaternion.Euler(50, -35, 0);
            RenderSettings.ambientLight = new Color(.52f,.59f,.73f);
            var camGo = new GameObject("Main Camera", typeof(Camera), typeof(AudioListener), typeof(CrwtCameraOrbit)); camGo.tag = "MainCamera";
            orbit = camGo.GetComponent<CrwtCameraOrbit>(); orbit.target = board.CameraTarget; orbit.distance = 21f; orbit.yaw = 0; orbit.pitch = 53f;
            sceneCamera = camGo.GetComponent<Camera>();
            sceneCamera.fieldOfView = 44f;
            sceneCamera.backgroundColor = MapBackground(CrwtSession.SelectedMapId);
            sceneCamera.clearFlags = CameraClearFlags.SolidColor;
            Application.targetFrameRate = PlayerPrefs.GetInt("CRWT_LowPower", 0) == 1 ? 30 : 60;
            sound = gameObject.AddComponent<CrwtAudio>();
            board.StepFinished += () => sound.Play("step");
            var picker = boardGo.AddComponent<CrwtBoardPicker>();
            picker.Selected += ShowTileInfo;
        }

        private void SetupHud()
        {
            var canvas = CrwtUi.CreateCanvas("MatchUI");
            var safe = CrwtUi.SafeRoot(canvas.transform);
            dice = gameObject.AddComponent<CrwtDicePresenter>();
            dice.Initialize(safe);
            dice.ZeroReact += roll => board.ReactToZero(roll.seat);
            dice.Revealed += roll => sound.Play(roll.zero_roll ? "zero" : "reveal");
            var top = CrwtUi.Panel(safe, "Turn bar", new Color(.10f,.12f,.24f,.96f), new Vector2(.015f,.875f), new Vector2(.985f,.985f), Vector2.zero, Vector2.zero);
            portrait = CrwtHudArt.Portrait(top, "alexia");
            Place((RectTransform)portrait.transform, new Vector2(.01f,.08f), new Vector2(.07f,.92f));
            activePlayer = CrwtUi.Text(top, "MENGHUBUNGKAN...", 23, TextAnchor.MiddleLeft, Color.white);
            activePlayer.resizeTextForBestFit = true; activePlayer.resizeTextMinSize = 14; activePlayer.resizeTextMaxSize = 23; activePlayer.verticalOverflow = VerticalWrapMode.Truncate;
            Place(activePlayer.rectTransform, new Vector2(.085f,.04f), new Vector2(.34f,.96f));
            header = CrwtUi.Text(top, "WORLD TOUR", 22, TextAnchor.MiddleCenter, CrwtUi.Gold);
            header.resizeTextForBestFit = true; header.resizeTextMinSize = 14; header.resizeTextMaxSize = 22;
            Place(header.rectTransform, new Vector2(.35f,.38f), new Vector2(.64f,.98f));
            clockLabel = CrwtUi.Text(top, "", 20, TextAnchor.MiddleCenter, Color.white);
            Place(clockLabel.rectTransform, new Vector2(.35f,.04f), new Vector2(.64f,.42f));
            var roster = CrwtUi.Button(top, "PEMAIN", () => playerPanel.gameObject.SetActive(!playerPanel.gameObject.activeSelf), CrwtUi.Cyan);
            Place((RectTransform)roster.transform, new Vector2(.66f,.22f), new Vector2(.76f,.78f));
            var settings = CrwtUi.Button(top, "OPSI", ShowSettings, CrwtUi.Lavender);
            Place((RectTransform)settings.transform, new Vector2(.78f,.22f), new Vector2(.86f,.78f));
            var exit = CrwtUi.Button(top, "LOBBY", ExitMatch, new Color(.72f,.79f,.93f));
            Place((RectTransform)exit.transform, new Vector2(.88f,.22f), new Vector2(.985f,.78f));
            playerPanel = CrwtUi.Panel(safe, "Players drawer", new Color(.11f,.13f,.25f,.96f), new Vector2(.015f,.21f), new Vector2(.28f,.855f), Vector2.zero, Vector2.zero);
            players = CrwtUi.Text(playerPanel, "", 21, TextAnchor.UpperLeft, Color.white); CrwtUi.Fill(players.rectTransform, 20);
            players.resizeTextForBestFit = true; players.resizeTextMinSize = 14; players.resizeTextMaxSize = 21;
            playerPanel.gameObject.SetActive(false);
            var status = CrwtUi.Panel(safe, "Event caption", new Color(.13f,.15f,.28f,.90f), new Vector2(.22f,.155f), new Vector2(.78f,.22f), Vector2.zero, Vector2.zero);
            message = CrwtUi.Text(status, "Menyiapkan papan...", 23, TextAnchor.MiddleCenter, Color.white); CrwtUi.Fill(message.rectTransform, 9);
            message.resizeTextForBestFit = true; message.resizeTextMinSize = 16; message.resizeTextMaxSize = 23;
            actions = CrwtUi.Panel(safe, "Actions", new Color(.11f,.13f,.25f,.94f), new Vector2(.22f,.025f), new Vector2(.78f,.145f), Vector2.zero, Vector2.zero);
            CrwtUi.Horizontal(actions, 10);

            resultBanner = CrwtUi.Panel(safe, "Anime Result Banner", new Color(.14f,.12f,.28f,.98f),
                new Vector2(.24f,.61f), new Vector2(.76f,.82f), Vector2.zero, Vector2.zero);
            var crown = CrwtUi.Text(resultBanner, "★", 46, TextAnchor.MiddleCenter, CrwtUi.Gold);
            Place(crown.rectTransform, new Vector2(.04f,.52f), new Vector2(.14f,.96f));
            resultTitle = CrwtUi.Text(resultBanner, "", 38, TextAnchor.MiddleCenter, CrwtUi.Gold);
            resultTitle.resizeTextForBestFit = true; resultTitle.resizeTextMinSize = 24; resultTitle.resizeTextMaxSize = 38;
            Place(resultTitle.rectTransform, new Vector2(.15f,.48f), new Vector2(.95f,.94f));
            resultSubtitle = CrwtUi.Text(resultBanner, "", 22, TextAnchor.MiddleCenter, Color.white);
            resultSubtitle.resizeTextForBestFit = true; resultSubtitle.resizeTextMinSize = 15; resultSubtitle.resizeTextMaxSize = 22;
            Place(resultSubtitle.rectTransform, new Vector2(.08f,.08f), new Vector2(.92f,.50f));
            resultBanner.gameObject.SetActive(false);

            sheet = gameObject.AddComponent<CrwtActionSheet>(); sheet.Initialize(safe);
        }

        private static void Place(RectTransform rect, Vector2 min, Vector2 max)
        { rect.anchorMin = min; rect.anchorMax = max; rect.offsetMin = rect.offsetMax = Vector2.zero; }

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
            board.Build(snap.state.map_id); orbit.target = board.CameraTarget; Render();
        }

        private async void RefreshNow()
        {
            if (polling) return; polling = true;
            try
            {
                var response = await CrwtAppRoot.Instance.Api.SnapshotAsync(CrwtSession.MatchId);
                if (!this) return;
                syncFailed = false; AcceptSnapshot(response, true);
            }
            catch (Exception) { if (this) { syncFailed = true; message.text = "Koneksi terputus • mencoba kembali..."; RebuildActions(); nextPoll = Time.unscaledTime + 2f; } }
            finally { polling = false; }
        }

        private void Render()
        {
            if (snap?.state == null) return;
            if (dice.IsBusy) { RebuildActions(); return; }
            if (CrwtSession.SelectedMapId != snap.state.map_id && !string.IsNullOrEmpty(snap.state.map_id))
            {
                CrwtSession.SelectedMapId = snap.state.map_id; board.Build(snap.state.map_id); orbit.target = board.CameraTarget;
                if (sceneCamera) sceneCamera.backgroundColor = MapBackground(snap.state.map_id);
            }
            board.Apply(snap);
            header.text = CrwtRuntimeConfig.MapName(snap.state.map_id).ToUpperInvariant() + " • " + snap.round;
            header.color = MapAccentUi(snap.state.map_id);
            var current = snap.state.players?.FirstOrDefault(p => p.seat == snap.turn_seat);
            activePlayer.text = current == null ? "MENUNGGU PEMAIN" : (snap.turn_seat == snap.your_seat ? "GILIRANMU" : "GILIRAN " + current.name) + "\n" + current.cash + " K  •  " + CrwtHudArt.CharacterDisplayName(current.character_id);
            activePlayer.color = snap.turn_seat == snap.your_seat ? CrwtUi.Gold : Color.white;
            CrwtHudArt.SetPortrait(portrait, current?.character_id);
            if (!resultActionsBuilt && !rematchVoted) message.text = snap.state.message ?? snap.state.last_roll?.@event ?? "ONLINE";
            var sb = new StringBuilder();
            foreach (var p in snap.state.players ?? Array.Empty<CrwtPlayer>())
                sb.AppendLine((p.seat == snap.turn_seat ? "★ " : "  ") + "S" + p.seat + "  " + p.name + "  •  " + CrwtHudArt.CharacterDisplayName(p.character_id)
                    + "\n     " + p.cash + "K • Tile " + p.position + (p.bankrupt ? " • BANKRUPT" : ""));
            players.text = sb.ToString();
            ValidateSheet();
            RebuildActions();
            if (!board.IsMoving && pendingCue != null) { sound.Play(pendingCue); pendingCue = null; }
            if (!CrwtSession.IsGuest && !syncFailed && snap.current_is_bot && snap.is_host && snap.status == "active" && snap.state.phase == "await_roll" && !actionBusy && !board.IsMoving && queuedSnapshot == null) BotStep();
            if (snap.status == "finished" || snap.state.phase == "finished") ShowResultActions();
        }

        private void RebuildActions()
        {
            if (snap?.state != null && (snap.status == "finished" || snap.state.phase == "finished") && (resultLoading || resultActionsBuilt)) return;
            string signature = (snap?.version ?? -1) + ":" + actionBusy + ":" + dice.IsBusy + ":" + board.IsMoving + ":" + choosingFocus + ":" + syncFailed;
            if (signature == actionSignature) return;
            actionSignature = signature;
            CrwtUi.Clear(actions);
            if (snap == null) return;
            if (CrwtSession.IsGuest) { LabelAction("DEMO VISUAL • Login untuk ROLL"); return; }
            if (syncFailed) { LabelAction("Menghubungkan kembali..."); return; }
            if (actionBusy || dice.IsBusy) { LabelAction("Dadu sedang bergulir..."); return; }
            if (board.IsMoving) { LabelAction("Pemain bergerak..."); return; }
            if (snap.status == "finished" || snap.state.phase == "finished") return;
            if (snap.spectator || snap.your_seat <= 0) { LabelAction("MENONTON"); return; }
            if (snap.state.phase == "auction")
            {
                if (CrwtActionOptions.CanBid(snap))
                    CrwtUi.Button(actions, "LELANG • " + CrwtActionOptions.MinimumBid(snap.state.pending) + " K", ShowAuction, CrwtUi.Gold);
                else LabelAction("Mengikuti lelang...");
                return;
            }
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
                CrwtUi.Button(actions, "ROLL", () => RunAction(() => CrwtAppRoot.Instance.Api.RollAsync(CrwtSession.MatchId), true), CrwtUi.Gold, 86);
                CrwtUi.Button(actions, "SKILL", UseSkill, CrwtUi.Lavender, 76);
                if ((snap.state.players?.FirstOrDefault(x => x.seat == snap.your_seat)?.cards?.Length ?? 0) > 0)
                    CrwtUi.Button(actions, "KARTU", ShowCards, CrwtUi.Rose, 76);
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
                    case "upgrade": CrwtUi.Button(actions, "UPGRADE " + p.price + " K", () => RunAction(() => CrwtAppRoot.Instance.Api.UpgradeAsync(CrwtSession.MatchId)), CrwtUi.Gold); break;
                    case "takeover": CrwtUi.Button(actions, "TAKEOVER " + p.price + " K", () => RunAction(() => CrwtAppRoot.Instance.Api.TakeoverAsync(CrwtSession.MatchId)), CrwtUi.Gold); break;
                    case "festival":
                        CrwtUi.Button(actions, "PILIH DISTRIK", ShowFestival, CrwtUi.Cyan);
                        return;
                    case "travel":
                        CrwtUi.Button(actions, "PILIH KOTA", ShowTravel, CrwtUi.Cyan);
                        break;
                }
                CrwtUi.Button(actions, "LEWATI", () => RunAction(() => CrwtAppRoot.Instance.Api.SkipAsync(CrwtSession.MatchId)), new Color(.70f,.72f,.78f));
                return;
            }
            if (snap.state.phase == "liquidation")
            {
                if (CrwtActionOptions.OwnedTiles(snap).Length > 0) CrwtUi.Button(actions, "PILIH ASET", ShowAssets, CrwtUi.Gold);
                CrwtUi.Button(actions, "BANGKRUT", ConfirmBankruptcy, CrwtUi.Danger);
                return;
            }
            LabelAction("Sinkronisasi server...");
        }

        private static Color MapBackground(string map) => map switch
        {
            "tokyo_rush" => new Color(.20f,.10f,.25f),
            "tropical_paradise" => new Color(.10f,.38f,.45f),
            "candy_world" => new Color(.32f,.15f,.38f),
            "fantasy_kingdom" => new Color(.15f,.12f,.34f),
            _ => new Color(.18f,.42f,.62f)
        };

        private static Color MapAccentUi(string map) => map switch
        {
            "tokyo_rush" => CrwtUi.Rose,
            "tropical_paradise" => CrwtUi.Mint,
            "candy_world" => new Color(1f,.65f,.34f),
            "fantasy_kingdom" => CrwtUi.Lavender,
            _ => CrwtUi.Cyan
        };

        private void UseSkill()
        {
            var me = snap?.state?.players?.FirstOrDefault(x => x.seat == snap.your_seat);
            if (me?.character_id == "kairo") { choosingFocus = true; RebuildActions(); }
            else RunAction(() => CrwtAppRoot.Instance.Api.UseSkillAsync(CrwtSession.MatchId), false, true);
        }

        private string ChoiceContext => snap?.state == null ? "" : snap.state.phase + ":" + snap.state.pending?.type + ":" + snap.state.pending?.tile_id;

        private void ValidateSheet()
        {
            if (!sheet.IsOpen || sheet.Context == "settings") return;
            if (sheet.Context == "info") { if (actionBusy || dice.IsBusy || board.IsMoving) sheet.Close(); return; }
            bool eligible = snap.state.phase == "auction" ? CrwtActionOptions.CanBid(snap) : snap.turn_seat == snap.your_seat && !snap.spectator;
            if (sheet.Context != ChoiceContext || !eligible || actionBusy || dice.IsBusy || board.IsMoving || snap.status == "finished") sheet.Close();
        }

        private void ShowTravel()
        {
            sheet.Show("WORLD TRAVEL • pilih tujuan", ChoiceContext);
            sheet.Note("Pilih kota atau resort. Pembelian, sewa, dan bonus ditentukan setelah tiba.");
            for (int i = 0; i < 32; i++)
            {
                var tile = CrwtTileCatalog.Get(snap.state.map_id, i);
                if (!CrwtActionOptions.IsTravelKind(tile.Kind)) continue;
                int id = i;
                string owner = snap.state.properties != null && snap.state.properties.TryGetValue(id.ToString(), out var prop) ? " • Pemain " + prop.owner_seat : " • Belum dimiliki";
                CrwtUi.Button(sheet.Content, tile.Name + owner, () => RunAction(() => CrwtAppRoot.Instance.Api.TravelAsync(CrwtSession.MatchId, id)), CrwtUi.Cyan);
            }
        }

        private void ShowTileInfo(int id)
        {
            if (snap?.state == null || dice.IsBusy || actionBusy || board.IsMoving || sheet.IsOpen) return;
            var tile = CrwtTileCatalog.Get(snap.state.map_id, id);
            sheet.Show(tile.Name.ToUpperInvariant(), "info");
            string kind = tile.Kind switch { "city" => "KOTA", "resort" => "RESORT", "chance" => "KEJUTAN", "island" => "PULAU", "festival" => "FESTIVAL", "travel" => "WORLD TRAVEL", "tax" => "PAJAK", "bonus" => "BONUS", _ => "START" };
            sheet.Note("Tile " + id + " • " + kind + (tile.Group >= 0 ? " • Distrik " + (tile.Group + 1) : ""));
            if (snap.state.properties != null && snap.state.properties.TryGetValue(id.ToString(), out var property) && property != null)
            {
                string[] levels = { "Tanah", "House", "Tower", "Hotel", "Landmark" };
                var owner = snap.state.players?.FirstOrDefault(p => p.seat == property.owner_seat);
                sheet.Note("Pemilik: " + (owner?.name ?? ("Pemain " + property.owner_seat)) + "\nBangunan: " + levels[Mathf.Clamp(property.level,0,4)]);
            }
            else if (CrwtActionOptions.IsTravelKind(tile.Kind)) sheet.Note("Belum dimiliki.");
            if (snap.state.pending?.tile_id == id && snap.state.pending.price > 0)
                sheet.Note("Penawaran saat ini: " + snap.state.pending.price + " K");
            sheet.Note("Tindakan tersedia melalui tombol giliran setelah pemain mendarat.");
        }

        private void ShowFestival()
        {
            sheet.Show("FESTIVAL • pilih distrik", ChoiceContext);
            var groups = Enumerable.Range(0,32).Select(i => CrwtTileCatalog.Get(snap.state.map_id, i)).Where(t => t.Kind == "city" && t.Group >= 0).GroupBy(t => t.Group).OrderBy(g => g.Key);
            foreach (var group in groups)
            {
                int id = group.Key;
                var button = CrwtUi.Button(sheet.Content, "DISTRIK " + (id + 1) + " • " + string.Join(", ", group.Select(t => t.Name)), () => RunAction(() => CrwtAppRoot.Instance.Api.FestivalAsync(CrwtSession.MatchId, id)), CrwtUi.Cyan, 84);
                var label = button.GetComponentInChildren<Text>(); label.resizeTextForBestFit = true; label.resizeTextMinSize = 16; label.resizeTextMaxSize = 24;
            }
        }

        private void ShowAuction()
        {
            if (!CrwtActionOptions.CanBid(snap)) return;
            sheet.Show("LELANG • " + snap.state.pending.name, ChoiceContext);
            var info = sheet.Note("Tawaran minimum: " + CrwtActionOptions.MinimumBid(snap.state.pending) + " K\nTertinggi: " + snap.state.pending.current_bid + " K");
            var amount = CrwtUi.Input(sheet.Content, "Nominal tawaran (K)");
            amount.contentType = InputField.ContentType.IntegerNumber;
            amount.text = CrwtActionOptions.MinimumBid(snap.state.pending).ToString();
            CrwtUi.Button(sheet.Content, "KIRIM TAWARAN", () =>
            {
                if (!int.TryParse(amount.text, out int value) || !CrwtActionOptions.ValidBid(snap, value))
                {
                    info.text = "Periksa saldo. Minimum terbaru: " + CrwtActionOptions.MinimumBid(snap.state.pending) + " K";
                    return;
                }
                RunAction(() => CrwtAppRoot.Instance.Api.AuctionBidAsync(CrwtSession.MatchId, value));
            }, CrwtUi.Gold);
            CrwtUi.Button(sheet.Content, "IKUTI MINIMUM TERBARU", () =>
            {
                amount.text = CrwtActionOptions.MinimumBid(snap.state.pending).ToString();
                info.text = "Minimum terbaru: " + amount.text + " K";
            }, CrwtUi.Cyan);
            if (CrwtActionOptions.CanPass(snap)) CrwtUi.Button(sheet.Content, "PASS LELANG", () =>
            {
                if (CrwtActionOptions.CanPass(snap)) RunAction(() => CrwtAppRoot.Instance.Api.AuctionPassAsync(CrwtSession.MatchId));
                else info.text = "Penawar tertinggi tidak dapat PASS.";
            }, new Color(.76f,.79f,.84f));
            else sheet.Note("Kamu penawar tertinggi. Tunggu lelang selesai atau naikkan tawaran.");
        }

        private void ShowAssets()
        {
            sheet.Show("LIKUIDASI • pilih aset", ChoiceContext);
            sheet.Note("Utang: " + snap.state.pending.debt + " K. Pilih properti yang akan dijual; penjualan dikonfirmasi server.");
            foreach (int tile in CrwtActionOptions.OwnedTiles(snap))
            {
                int id = tile;
                var prop = snap.state.properties[id.ToString()];
                CrwtUi.Button(sheet.Content, CrwtTileCatalog.Get(snap.state.map_id, id).Name + " • Level " + prop.level + " • JUAL", () =>
                {
                    sheet.Show("JUAL " + CrwtTileCatalog.Get(snap.state.map_id, id).Name, ChoiceContext);
                    sheet.Note("Kepemilikan properti ini akan dilepas. Lanjutkan penjualan?");
                    CrwtUi.Button(sheet.Content, "YA, JUAL ASET", () => RunAction(() => CrwtAppRoot.Instance.Api.SellAssetAsync(CrwtSession.MatchId, id)), CrwtUi.Gold);
                    CrwtUi.Button(sheet.Content, "KEMBALI", ShowAssets, CrwtUi.Cyan);
                }, CrwtUi.Gold);
            }
        }

        private void ConfirmBankruptcy()
        {
            sheet.Show("KONFIRMASI BANGKRUT", ChoiceContext);
            sheet.Note("Menyerah akan mengakhiri partisipasimu dalam pertandingan ini.");
            CrwtUi.Button(sheet.Content, "YA, NYATAKAN BANGKRUT", () => RunAction(() => CrwtAppRoot.Instance.Api.DeclareBankruptcyAsync(CrwtSession.MatchId)), CrwtUi.Danger);
        }

        private void ShowCards()
        {
            sheet.Show("KARTU DI TANGAN", ChoiceContext);
            var me = snap.state.players.FirstOrDefault(p => p.seat == snap.your_seat);
            foreach (string entry in (me?.cards ?? Array.Empty<string>()).Distinct())
            {
                string card = entry;
                CrwtUi.Button(sheet.Content, card.Replace('_',' ').ToUpperInvariant(), () =>
                {
                    if (!CrwtActionOptions.NeedsTarget(card)) { RunAction(() => CrwtAppRoot.Instance.Api.UseCardAsync(CrwtSession.MatchId, card)); return; }
                    sheet.Show("PILIH TARGET • " + card.ToUpperInvariant(), ChoiceContext);
                    foreach (var candidate in snap.state.players.Where(p => !p.bankrupt && p.seat != snap.your_seat))
                    {
                        int seat = candidate.seat;
                        CrwtUi.Button(sheet.Content, candidate.name, () => RunAction(() => CrwtAppRoot.Instance.Api.UseCardAsync(CrwtSession.MatchId, card, seat)), CrwtUi.Cyan);
                    }
                }, CrwtUi.Rose);
            }
        }

        private void ShowSettings()
        {
            sheet.Show("PENGATURAN", "settings");
            CrwtUi.Button(sheet.Content, "SUARA: " + (PlayerPrefs.GetInt("CRWT_Mute",0) == 0 ? "AKTIF" : "MATI"), () => { TogglePreference("CRWT_Mute"); ShowSettings(); }, CrwtUi.Cyan);
            CrwtUi.Button(sheet.Content, "KURANGI GERAKAN: " + (PlayerPrefs.GetInt("CRWT_ReducedMotion",0) == 1 ? "YA" : "TIDAK"), () => { TogglePreference("CRWT_ReducedMotion"); ShowSettings(); }, CrwtUi.Mint);
            CrwtUi.Button(sheet.Content, "HEMAT DAYA: " + (PlayerPrefs.GetInt("CRWT_LowPower",0) == 1 ? "30 FPS" : "60 FPS"), () => { TogglePreference("CRWT_LowPower"); Application.targetFrameRate = PlayerPrefs.GetInt("CRWT_LowPower") == 1 ? 30 : 60; ShowSettings(); }, CrwtUi.Lavender);
            CrwtUi.Button(sheet.Content, "RESET KAMERA", () => { orbit.distance = 21; orbit.yaw = 0; orbit.pitch = 53; sheet.Close(); }, CrwtUi.Gold);
            sheet.Note("Geser papan untuk memutar kamera. Cubit dengan dua jari atau gunakan scroll untuk zoom.");
        }
        private static void TogglePreference(string name) { PlayerPrefs.SetInt(name, 1 - PlayerPrefs.GetInt(name,0)); PlayerPrefs.Save(); }

        private void UpdateDeadline()
        {
            if (snap?.state == null || !DateTimeOffset.TryParse(snap.deadline_at, out var deadline)) return;
            double seconds = (deadline - DateTimeOffset.UtcNow).TotalSeconds;
            clockLabel.text = snap.status == "finished" ? "PERTANDINGAN SELESAI" : "WAKTU " + Math.Max(0, Math.Ceiling(seconds)) + "s";
            clockLabel.color = snap.status == "finished" ? CrwtUi.Gold : seconds <= 5 ? CrwtUi.Danger : Color.white;
            if (seconds <= -1 && Time.unscaledTime >= nextTimeoutCheck && !syncFailed && !timeoutBusy && !actionBusy && !dice.IsBusy && !board.IsMoving && snap.status == "active" && snap.your_seat > 0 && !snap.spectator)
            { nextTimeoutCheck = Time.unscaledTime + 3; TickTimeout(); }
        }
        private async void TickTimeout()
        {
            timeoutBusy = true;
            try
            {
                var response = await CrwtAppRoot.Instance.Api.TimeoutTickAsync(CrwtSession.MatchId);
                if (!this) return;
                // The RPC checks its own clock and may return only acted:false.
                if (response?.state != null) AcceptSnapshot(response, false);
                nextPoll = 0;
            }
            catch (Exception) { if (this) nextPoll = 0; }
            finally { timeoutBusy = false; }
        }
        private void OnApplicationFocus(bool focused) { if (focused) { nextPoll = 0; nextRematchPoll = 0; } }

        private void ApplyFocus(string mode)
        {
            choosingFocus = false;
            RunAction(() => CrwtAppRoot.Instance.Api.UseSkillAsync(CrwtSession.MatchId, mode), false, true);
        }

        private async void RunAction(Func<System.Threading.Tasks.Task<CrwtMatchSnapshot>> action, bool isRoll = false, bool skill = false)
        {
            if (actionBusy || dice.IsBusy || board.IsMoving || syncFailed) return; actionBusy = true;
            sheet.Close();
            int actor = snap?.your_seat ?? 0;
            if (isRoll) { dice.BeginThrow(); sound.Play("throw"); }
            RebuildActions();
            try
            {
                var response = await action();
                if (!this) return;
                if (isRoll && response?.state?.last_roll == null) throw new CrwtApiException("Server belum memberi hasil dadu.");
                AcceptSnapshot(response, false);
                if (skill) board.PlaySkill(actor);
                if (isRoll && !dice.IsPresenting) { dice.CancelWaiting(); Render(); }
            }
            catch (Exception ex) { if (this) { dice.CancelWaiting(); syncFailed = true; message.text = "Aksi belum dikonfirmasi • " + ex.Message; nextPoll = 0; } }
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
            var oldMe = snap?.state?.players?.FirstOrDefault(p => p.seat == incoming.your_seat);
            var newMe = incoming.state.players?.FirstOrDefault(p => p.seat == incoming.your_seat);
            if (snap != null && incoming.version > snap.version && oldMe != null && newMe != null && oldMe.cash != newMe.cash)
                pendingCue = newMe.cash > oldMe.cash ? "gain" : "pay";
            if (snap != null && incoming.version > snap.version && incoming.state.properties != null)
                foreach (var property in incoming.state.properties)
                    if (property.Value != null && (snap.state.properties == null || !snap.state.properties.TryGetValue(property.Key, out var oldProperty) || oldProperty == null || oldProperty.level != property.Value.level || oldProperty.owner_seat != property.Value.owner_seat))
                    { pendingCue = "build"; break; }
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
            dice.BeginThrow(); sound.Play("throw"); RebuildActions();
            try
            {
                var response = await CrwtAppRoot.Instance.Api.BotStepAsync(CrwtSession.MatchId);
                if (!this) return;
                if (response?.state?.last_roll == null) throw new CrwtApiException("Server belum memberi hasil dadu bot.");
                AcceptSnapshot(response, false);
                if (!dice.IsPresenting) { dice.CancelWaiting(); Render(); }
            }
            catch (Exception ex) { if (this) { dice.CancelWaiting(); syncFailed = true; nextPoll = Time.unscaledTime + 2; message.text = "BOT • " + ex.Message; } }
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
                board.PlayResults(result.winner_seat);
                if (result.won) sound.Play("win");
                var goldReward = result.reward?.gold_reward ?? 0;
                var xpReward = result.reward?.xp_reward ?? 0;
                message.text = (result.won ? "🏆 WINNER" : "MATCH SELESAI") + " • +" + goldReward + " Gold • +" + xpReward + " XP";
                resultTitle.text = result.won ? "KAMU MENANG!" : "WORLD TOUR SELESAI";
                resultTitle.color = result.won ? CrwtUi.Gold : CrwtUi.Cyan;
                resultSubtitle.text = result.won
                    ? "BINTANG JUARA  •  +" + goldReward + " GOLD  •  +" + xpReward + " XP"
                    : "HASIL TERSIMPAN  •  +" + goldReward + " GOLD  •  +" + xpReward + " XP";
                resultBanner.GetComponent<Image>().color = result.won
                    ? Color.Lerp(CrwtUi.Card, CrwtUi.Gold, .18f)
                    : Color.Lerp(CrwtUi.Card, CrwtUi.Cyan, .12f);
                resultBanner.gameObject.SetActive(true);
            }
            catch { }
            if (!this) return;
            if (snap.your_seat > 0 && !snap.spectator) CrwtUi.Button(actions, "REMATCH", VoteRematch, CrwtUi.Gold);
            CrwtUi.Button(actions, "LOBBY", ExitMatch, CrwtUi.Cyan);
            resultActionsBuilt = true;
            resultLoading = false;
        }

        private async void VoteRematch()
        {
            if (rematchRequest || rematchVoted) return;
            rematchRequest = true;
            try
            {
                var r = await CrwtAppRoot.Instance.Api.VoteRematchAsync(CrwtSession.MatchId, true);
                if (!this) return;
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
            catch (Exception ex) { if (this) message.text = ex.Message; }
            finally { rematchRequest = false; }
        }

        private async void PollRematch()
        {
            if (!rematchVoted || rematchPolling || string.IsNullOrEmpty(CrwtSession.MatchId)) return;
            rematchPolling = true;
            try
            {
                var r = await CrwtAppRoot.Instance.Api.RematchStatusAsync(CrwtSession.MatchId);
                if (!this) return;
                if (!string.IsNullOrEmpty(r.new_room_id))
                {
                    rematchVoted = false; CrwtSession.RoomId = r.new_room_id; CrwtSession.MatchId = null; CrwtAppRoot.Instance.LoadLobby();
                }
                else message.text = "REMATCH • " + r.yes_votes + "/" + r.human_players + " setuju";
            }
            catch (Exception ex) { if (this) message.text = "REMATCH • " + ex.Message; }
            finally { rematchPolling = false; }
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
