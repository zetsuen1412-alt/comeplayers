using System;
using System.Text;
using System.Linq;
using UnityEngine;
using UnityEngine.UI;

namespace ComePlayers.CrazyRich
{
    public sealed class CrwtLobbyController : MonoBehaviour
    {
        private Dropdown map;
        private InputField joinCode;
        private Text roomInfo;
        private RectTransform roomMembers;
        private Text status;
        private Button readyButton;
        private Button addBotButton;
        private Button startButton;
        private CrwtActionSheet hubSheet;
        private CrwtProgressionSnapshot progression;
        private CrwtEventSnapshot events;
        private RectTransform eventBanner;
        private Text eventBannerText;
        private bool progressionBusy;
        private bool eventBusy;
        private string hubSection = "collection";
        private float nextPoll;
        private bool polling;
        private bool selfReady;
        private bool selfHost;
        private bool roomActionBusy;
        private bool leaving;
        private int roomReadVersion;

        private void Start()
        {
            var canvas = CrwtUi.CreateCanvas("LobbyUI");
            var bg = CrwtUi.Panel(CrwtUi.SafeRoot(canvas.transform), "Background", CrwtUi.Bg, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            CrwtHudArt.Backdrop(bg);
            var header = CrwtUi.Panel(bg, "Header", new Color(.04f, .055f, .10f, 1), new Vector2(0, .88f), Vector2.one, Vector2.zero, Vector2.zero);
            var headerText = CrwtUi.Text(header, "CRAZY RICH: WORLD TOUR  •  30.0 ANIME WORLD", 30, TextAnchor.MiddleLeft, CrwtUi.Gold);
            CrwtUi.Fill(headerText.rectTransform, 0); headerText.rectTransform.offsetMin = new Vector2(38, 0); headerText.rectTransform.offsetMax = new Vector2(-38, 0);

            eventBanner = CrwtUi.Panel(bg, "Event Banner", new Color(.18f,.15f,.30f,.96f),
                new Vector2(.04f,.842f), new Vector2(.96f,.875f), Vector2.zero, Vector2.zero);
            eventBannerText = CrwtUi.Text(eventBanner, "EVENT & MISSIONS", 18, TextAnchor.MiddleLeft, Color.white);
            eventBannerText.resizeTextForBestFit = true; eventBannerText.resizeTextMinSize = 12; eventBannerText.resizeTextMaxSize = 18;
            eventBannerText.rectTransform.anchorMin = new Vector2(.02f,0); eventBannerText.rectTransform.anchorMax = new Vector2(.84f,1);
            eventBannerText.rectTransform.offsetMin = eventBannerText.rectTransform.offsetMax = Vector2.zero;
            var eventOpen = CrwtUi.Button(eventBanner, "BUKA", () => ShowHub("event"), CrwtUi.Gold, 42);
            var eventOpenRt = (RectTransform)eventOpen.transform;
            eventOpenRt.anchorMin = new Vector2(.86f,.10f); eventOpenRt.anchorMax = new Vector2(.985f,.90f);
            eventOpenRt.offsetMin = eventOpenRt.offsetMax = Vector2.zero;

            var menu = CrwtUi.Panel(bg, "Menu", CrwtUi.Card, new Vector2(.04f, .10f), new Vector2(.38f, .835f), Vector2.zero, Vector2.zero);
            CrwtUi.Vertical(menu, 14, new RectOffset(28, 28, 28, 28));
            CrwtUi.Text(menu, CrwtSession.IsGuest ? "DEMO OFFLINE" : (CrwtSession.DisplayName + " • ONLINE"), 29, TextAnchor.MiddleCenter, Color.white).gameObject.AddComponent<LayoutElement>().preferredHeight = 60;
            map = Dropdown(menu, CrwtRuntimeConfig.MapNames);
            map.value = Mathf.Max(0, Array.IndexOf(CrwtRuntimeConfig.MapIds, CrwtSession.SelectedMapId));
            map.onValueChanged.AddListener(i =>
            {
                CrwtSession.SelectedMapId = CrwtRuntimeConfig.MapIds[Mathf.Clamp(i, 0, CrwtRuntimeConfig.MapIds.Length - 1)];
                UpdateMapStatus();
            });

            if (CrwtSession.IsGuest)
            {
                CrwtUi.Button(menu, "MAIN DEMO 3D", () => { CrwtSession.MatchId = null; CrwtAppRoot.Instance.LoadMatch(); }, CrwtUi.Gold);
            }
            else
            {
                CrwtUi.Button(menu, "BUAT PRACTICE 2P + BOT", CreatePractice, CrwtUi.Gold);
                CrwtUi.Button(menu, "QUICK MATCH 4P", QuickMatch, CrwtUi.Cyan);
                joinCode = CrwtUi.Input(menu, "Kode room 6 karakter");
                CrwtUi.Button(menu, "GABUNG ROOM", JoinRoom, new Color(.75f, .80f, .92f));
            }
            CrwtUi.Button(menu, "KELUAR", Logout, new Color(.55f, .58f, .66f));
            status = CrwtUi.Text(menu, "", 18, TextAnchor.MiddleCenter, new Color(1, 1, 1, .74f));
            status.gameObject.AddComponent<LayoutElement>().preferredHeight = 92;
            status.resizeTextForBestFit = true; status.resizeTextMinSize = 13; status.resizeTextMaxSize = 18;
            UpdateMapStatus();

            var room = CrwtUi.Panel(bg, "Room", new Color(.045f, .065f, .12f, .96f), new Vector2(.42f, .10f), new Vector2(.96f, .835f), Vector2.zero, Vector2.zero);
            CrwtUi.Vertical(room, 14, new RectOffset(28, 28, 28, 28));
            roomInfo = CrwtUi.Text(room, CrwtSession.IsGuest ? "Pilih map lalu MAIN DEMO 3D." : "Belum berada di room.", 24, TextAnchor.UpperLeft, Color.white);
            roomInfo.gameObject.AddComponent<LayoutElement>().preferredHeight = 112;

            roomMembers = CrwtUi.Panel(room, "Room members", new Color(.08f,.10f,.20f,.78f),
                Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            roomMembers.gameObject.AddComponent<LayoutElement>().preferredHeight = 360;
            CrwtUi.Vertical(roomMembers, 6, new RectOffset(8,8,8,8));
            if (CrwtSession.IsGuest)
            {
                var note = CrwtUi.Text(roomMembers, "DEMO PLAYER\nALEXIA • WORLD TOUR", 20, TextAnchor.MiddleCenter, Color.white);
                note.gameObject.AddComponent<LayoutElement>().preferredHeight = 74;
            }

            readyButton = CrwtUi.Button(room, "READY", ToggleReady, CrwtUi.Cyan);
            addBotButton = CrwtUi.Button(room, "+ BOT", AddBot, new Color(.65f, .82f, .60f));
            startButton = CrwtUi.Button(room, "START MATCH", StartMatch, CrwtUi.Gold);
            readyButton.gameObject.SetActive(false); addBotButton.gameObject.SetActive(false); startButton.gameObject.SetActive(false);

            var nav = CrwtUi.Panel(bg, "Main Lobby Navigation", new Color(.08f,.10f,.20f,.96f),
                new Vector2(.04f,.018f), new Vector2(.96f,.085f), Vector2.zero, Vector2.zero);
            CrwtUi.Horizontal(nav, 8);
            CrwtUi.Button(nav, "KARAKTER", () => ShowHub("character"), CrwtUi.Rose, 58);
            CrwtUi.Button(nav, "DADU", () => ShowHub("dice"), CrwtUi.Lavender, 58);
            CrwtUi.Button(nav, "KARTU", () => ShowHub("cards"), CrwtUi.Cyan, 58);
            CrwtUi.Button(nav, "KOLEKSI", () => ShowHub("collection"), CrwtUi.Mint, 58);
            CrwtUi.Button(nav, "TOKO", () => ShowHub("shop"), CrwtUi.Gold, 58);
            CrwtUi.Button(nav, "EVENT", () => ShowHub("event"), new Color(1f,.56f,.32f), 58);

            hubSheet = gameObject.AddComponent<CrwtActionSheet>();
            hubSheet.Initialize(bg);
            RenderEventBanner();
            if (!CrwtSession.IsGuest) { LoadProgression(); LoadEvents(); ResumeRoom(); }
        }

        private void Update()
        {
            if (leaving) return;
            if (!CrwtSession.IsOnline || string.IsNullOrEmpty(CrwtSession.RoomId)) return;
            if (Time.unscaledTime >= nextPoll && !polling && !roomActionBusy)
            {
                nextPoll = Time.unscaledTime + CrwtRuntimeConfig.RoomPollSeconds;
                PollRoom();
            }
        }

        private async void ResumeRoom()
        {
            try
            {
                var r = await CrwtAppRoot.Instance.Api.ResumeRoomAsync();
                if (!this || leaving) return;
                if (!string.IsNullOrEmpty(r?.room_id)) { CrwtSession.RoomId = r.room_id; await RefreshRoom(); }
            }
            catch { /* no room is normal */ }
        }

        private async void CreatePractice()
        {
            if (roomActionBusy || leaving) return; roomActionBusy = true;
            try
            {
                SetStatus("Membuat Practice...");
                var r = await CrwtAppRoot.Instance.Api.CreateRoomAsync("Unity Practice", "classic", CrwtSession.SelectedMapId, 2, "private", true);
                if (!this || leaving) return;
                CrwtSession.RoomId = r.room_id;
                await CrwtAppRoot.Instance.Api.SetReadyAsync(r.room_id, true);
                await RefreshRoom();
            }
            catch (Exception ex) { SetStatus(ex.Message); }
            finally { roomActionBusy = false; }
        }

        private async void QuickMatch()
        {
            if (roomActionBusy || leaving) return; roomActionBusy = true;
            try
            {
                SetStatus("Masuk matchmaking 4P...");
                var r = await CrwtAppRoot.Instance.Api.QuickMatchAsync(4, "classic", CrwtSession.SelectedMapId, false);
                if (!this || leaving) return;
                CrwtSession.RoomId = r.room_id;
                await RefreshRoom();
            }
            catch (Exception ex) { SetStatus(ex.Message); }
            finally { roomActionBusy = false; }
        }

        private async void JoinRoom()
        {
            var code = (joinCode?.text ?? "").Trim().ToUpperInvariant();
            if (code.Length != 6) { SetStatus("Kode room harus 6 karakter."); return; }
            if (roomActionBusy || leaving) return; roomActionBusy = true;
            try
            {
                var r = await CrwtAppRoot.Instance.Api.JoinRoomAsync(code);
                if (!this || leaving) return;
                CrwtSession.RoomId = r.room_id;
                await RefreshRoom();
            }
            catch (Exception ex) { SetStatus(ex.Message); }
            finally { roomActionBusy = false; }
        }

        private async void ToggleReady()
        {
            if (roomActionBusy || leaving || string.IsNullOrEmpty(CrwtSession.RoomId)) return;
            roomActionBusy = true;
            try { await CrwtAppRoot.Instance.Api.SetReadyAsync(CrwtSession.RoomId, !selfReady); await RefreshRoom(); }
            catch (Exception ex) { SetStatus(ex.Message); }
            finally { roomActionBusy = false; }
        }

        private async void AddBot()
        {
            if (roomActionBusy || leaving || !selfHost || string.IsNullOrEmpty(CrwtSession.RoomId)) return;
            roomActionBusy = true;
            try { await CrwtAppRoot.Instance.Api.AddBotAsync(CrwtSession.RoomId); await RefreshRoom(); }
            catch (Exception ex) { SetStatus(ex.Message); }
            finally { roomActionBusy = false; }
        }

        private async void StartMatch()
        {
            if (!selfHost || !selfReady) { SetStatus("Host harus READY sebelum START."); return; }
            if (roomActionBusy || leaving) return; roomActionBusy = true;
            try
            {
                var r = await CrwtAppRoot.Instance.Api.StartMatchAsync(CrwtSession.RoomId);
                if (!this || leaving) return;
                leaving = true;
                CrwtSession.MatchId = r.match_id;
                CrwtAppRoot.Instance.LoadMatch();
            }
            catch (Exception ex) { SetStatus(ex.Message); }
            finally { roomActionBusy = false; }
        }

        private async void PollRoom()
        {
            polling = true;
            try { await RefreshRoom(); }
            catch (Exception ex) { SetStatus(ex.Message); }
            finally { polling = false; }
        }

        private async System.Threading.Tasks.Task RefreshRoom()
        {
            if (!this || leaving || string.IsNullOrEmpty(CrwtSession.RoomId)) return;
            string roomId = CrwtSession.RoomId;
            int requestVersion = ++roomReadVersion;
            var data = await CrwtAppRoot.Instance.Api.GetRoomAsync(roomId);
            if (!this || leaving || roomId != CrwtSession.RoomId || requestVersion != roomReadVersion || data?.room == null) return;
            try { await CrwtAppRoot.Instance.Api.TouchPresenceAsync(roomId); } catch { }
            if (!this || leaving || roomId != CrwtSession.RoomId || requestVersion != roomReadVersion) return;
            CrwtSession.SelectedMapId = data.room.map_id;
            if (map) map.value = Mathf.Max(0, Array.IndexOf(CrwtRuntimeConfig.MapIds, CrwtSession.SelectedMapId));
            UpdateMapStatus();
            var sb = new StringBuilder();
            sb.AppendLine(data.room.name + "   [" + data.room.code + "]");
            sb.AppendLine(CrwtRuntimeConfig.MapName(data.room.map_id) + " • " + data.room.mode.ToUpperInvariant() + " • LAST PLAYER STANDING");
            selfReady = false; selfHost = false;
            var members = data.members ?? Array.Empty<CrwtRoomMember>();
            foreach (var m in members)
            {
                var mine = m.user_id == CrwtSession.UserId;
                if (mine) { selfReady = m.ready; selfHost = m.is_host; }
            }
            roomInfo.text = sb.ToString();
            RenderRoomMembers(members);
            readyButton.gameObject.SetActive(true);
            addBotButton.gameObject.SetActive(selfHost);
            startButton.gameObject.SetActive(selfHost);
            readyButton.GetComponentInChildren<Text>().text = selfReady ? "BATAL READY" : "READY";

            if (data.room.status == "in_game")
            {
                var active = await CrwtAppRoot.Instance.Api.ActiveMatchForRoomAsync(CrwtSession.RoomId);
                if (!this || leaving) return;
                if (!string.IsNullOrEmpty(active?.match_id))
                {
                    leaving = true;
                    CrwtSession.MatchId = active.match_id;
                    CrwtAppRoot.Instance.LoadMatch();
                }
            }
        }

        private void RenderRoomMembers(CrwtRoomMember[] members)
        {
            if (!roomMembers) return;
            CrwtUi.Clear(roomMembers);
            if (members == null || members.Length == 0)
            {
                var empty = CrwtUi.Text(roomMembers, "Menunggu pemain bergabung...", 19, TextAnchor.MiddleCenter, new Color(1,1,1,.68f));
                empty.gameObject.AddComponent<LayoutElement>().preferredHeight = 48;
                return;
            }
            foreach (var member in members)
            {
                if (member == null) continue;
                var rowColor = member.ready
                    ? Color.Lerp(new Color(.11f,.14f,.26f,.96f), CrwtUi.Mint, .12f)
                    : new Color(.11f,.14f,.26f,.96f);
                var row = CrwtUi.Panel(roomMembers, "Seat " + member.seat, rowColor, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
                row.gameObject.AddComponent<LayoutElement>().preferredHeight = 40;

                var avatar = CrwtHudArt.Portrait(row, member.character_id);
                var avatarRt = (RectTransform)avatar.transform;
                avatarRt.anchorMin = new Vector2(.012f,.08f); avatarRt.anchorMax = new Vector2(.080f,.92f);
                avatarRt.offsetMin = avatarRt.offsetMax = Vector2.zero;

                var name = CrwtUi.Text(row,
                    (member.is_host ? "★ " : "") + "S" + member.seat + "  " + member.display_name
                    + "  •  " + CrwtHudArt.CharacterDisplayName(member.character_id)
                    + (!string.IsNullOrEmpty(member.bot_key) ? "  •  BOT" : ""),
                    18, TextAnchor.MiddleLeft, Color.white);
                name.resizeTextForBestFit = true; name.resizeTextMinSize = 12; name.resizeTextMaxSize = 18;
                name.rectTransform.anchorMin = new Vector2(.095f,.05f); name.rectTransform.anchorMax = new Vector2(.78f,.95f);
                name.rectTransform.offsetMin = name.rectTransform.offsetMax = Vector2.zero;

                var badge = CrwtUi.Panel(row, member.ready ? "READY" : "WAIT",
                    member.ready ? CrwtUi.Mint : new Color(.45f,.49f,.62f,1f),
                    new Vector2(.80f,.16f), new Vector2(.975f,.84f), Vector2.zero, Vector2.zero);
                var badgeText = CrwtUi.Text(badge, member.ready ? "READY" : "WAIT", 15, TextAnchor.MiddleCenter,
                    CrwtUi.TextColor(member.ready ? CrwtUi.Mint : new Color(.45f,.49f,.62f,1f)));
                CrwtUi.Fill(badgeText.rectTransform, 2);
            }
        }

        private async void LoadProgression()
        {
            await RefreshProgression();
        }

        private async System.Threading.Tasks.Task<bool> RefreshProgression()
        {
            if (CrwtSession.IsGuest) return false;
            try
            {
                progression = await CrwtAppRoot.Instance.Api.ProgressionSnapshotTypedAsync();
                if (!this) return false;
                SetStatus(ProgressionSummary());
                return progression?.profile != null;
            }
            catch (Exception ex)
            {
                if (this) SetStatus("Progression gagal dimuat • " + ex.Message);
                return false;
            }
        }

        private void ShowHub(string section)
        {
            if (!hubSheet) return;
            hubSection = section;
            switch (section)
            {
                case "character":
                    ShowItemList("character", "KARAKTER • Anime Travelers",
                        "Pilih traveler, buka karakter baru, tingkatkan level, atau pakai karakter untuk match berikutnya.");
                    break;
                case "dice":
                    ShowItemList("dice", "DADU • STARWHEEL COLLECTION",
                        "Koleksi Starwheel tetap memakai hasil server 0–6. Skin/level tidak membuat Unity menentukan RNG.");
                    break;
                case "cards":
                    ShowItemList("card", "KARTU • DECK 1–3",
                        "Susun 1–3 kartu unik. Efek kartu tetap diputuskan server saat pertandingan.");
                    break;
                case "collection":
                    ShowCollection();
                    break;
                case "shop":
                    ShowShop();
                    break;
                default:
                    ShowEvents();
                    break;
            }
        }

        private async void LoadEvents()
        {
            await RefreshEvents();
        }

        private async System.Threading.Tasks.Task<bool> RefreshEvents()
        {
            if (CrwtSession.IsGuest) { RenderEventBanner(); return false; }
            try
            {
                events = await CrwtAppRoot.Instance.Api.EventSnapshotAsync();
                if (!this) return false;
                RenderEventBanner();
                return true;
            }
            catch (Exception ex)
            {
                if (this)
                {
                    eventBannerText.text = "EVENT • sinkronisasi gagal";
                    SetStatus("Event gagal dimuat • " + ex.Message);
                }
                return false;
            }
        }

        private void RenderEventBanner()
        {
            if (!eventBanner || !eventBannerText) return;
            if (CrwtSession.IsGuest)
            {
                eventBanner.GetComponent<Image>().color = Color.Lerp(CrwtUi.Card, CrwtUi.Gold, .12f);
                eventBannerText.text = "DAILY & WEEKLY MISSIONS • LOGIN UNTUK REWARD";
                return;
            }
            var active = events?.events?.FirstOrDefault();
            var title = active?.title ?? "DAILY & WEEKLY MISSIONS";
            var claim = events?.claimable ?? 0;
            eventBanner.GetComponent<Image>().color = Color.Lerp(CrwtUi.Card, EventColor(active?.accent), .16f);
            eventBannerText.text = title + (claim > 0 ? "  •  " + claim + " REWARD SIAP DIAMBIL" : "  •  MISI AKTIF");
            eventBannerText.color = claim > 0 ? CrwtUi.Gold : Color.white;
        }

        private void ShowEvents()
        {
            hubSection = "event";
            hubSheet.Show("EVENT • DAILY & WEEKLY", "lobby-event");
            if (CrwtSession.IsGuest)
            {
                hubSheet.Note("Login untuk memuat progress mission dan mengambil reward.");
                return;
            }
            if (events == null)
            {
                hubSheet.Note("Event sedang disinkronkan dari server.");
                CrwtUi.Button(hubSheet.Content, "MUAT ULANG", LoadEvents, CrwtUi.Cyan);
                return;
            }

            var active = events.events?.FirstOrDefault();
            if (active != null)
            {
                hubSheet.Note(active.title + "\n" + active.subtitle + "\n" + active.description);
                hubSheet.Note("BERAKHIR • " + TimeLabel(active.ends_at));
            }
            hubSheet.Note("REWARD SIAP • " + events.claimable
                + "\nRESET DAILY • " + TimeLabel(events.daily_reset_at)
                + "\nRESET WEEKLY • " + TimeLabel(events.weekly_reset_at));

            foreach (var cadence in new[] { "daily", "weekly" })
            {
                hubSheet.Note(cadence == "daily" ? "DAILY MISSIONS" : "WEEKLY MISSIONS");
                foreach (var mission in (events.missions ?? Array.Empty<CrwtMission>()).Where(x => x != null && x.cadence == cadence))
                {
                    var id = mission.id;
                    var state = mission.claimed ? "DIAMBIL"
                        : mission.completed ? "CLAIM"
                        : mission.progress + "/" + mission.target;
                    CrwtUi.Button(hubSheet.Content,
                        mission.title + " • " + state + " • " + RewardLabel(mission),
                        () => ShowMission(id),
                        mission.completed && !mission.claimed ? CrwtUi.Gold
                            : cadence == "daily" ? CrwtUi.Cyan : CrwtUi.Lavender,
                        72);
                }
            }
        }

        private void ShowMission(string id)
        {
            var mission = events?.missions?.FirstOrDefault(x => x != null && x.id == id);
            if (mission == null) { ShowEvents(); return; }
            hubSheet.Show(mission.title + " • " + mission.cadence.ToUpperInvariant(), "lobby-mission");
            hubSheet.Note(mission.description);
            hubSheet.Note("PROGRESS • " + mission.progress + "/" + mission.target
                + "\nREWARD • " + RewardLabel(mission)
                + "\nRESET • " + TimeLabel(mission.reset_at));
            if (mission.claimed) hubSheet.Note("STATUS • REWARD SUDAH DIAMBIL");
            else if (mission.completed)
                CrwtUi.Button(hubSheet.Content, "CLAIM REWARD", () => ClaimMission(id), CrwtUi.Gold);
            else hubSheet.Note("Selesaikan mission untuk membuka tombol CLAIM.");
            CrwtUi.Button(hubSheet.Content, "KEMBALI KE EVENT", ShowEvents, CrwtUi.Cyan);
        }

        private async void ClaimMission(string id)
        {
            if (eventBusy || CrwtSession.IsGuest) return;
            eventBusy = true;
            try
            {
                var result = await CrwtAppRoot.Instance.Api.ClaimMissionAsync(id);
                if (!this) return;
                events = result.events;
                progression = result.progression;
                RenderEventBanner();
                SetStatus("Reward mission diterima • +" + result.reward_gold + " GOLD"
                    + (result.reward_diamonds > 0 ? " • +" + result.reward_diamonds + " DIAMOND" : ""));
                ShowEvents();
            }
            catch (Exception ex)
            {
                if (this)
                {
                    ShowMission(id);
                    hubSheet.Note("CLAIM GAGAL • " + FriendlyMissionError(ex.Message));
                }
            }
            finally { eventBusy = false; }
        }

        private static string RewardLabel(CrwtMission mission)
        {
            if (mission == null) return "-";
            var reward = mission.reward_gold + " GOLD";
            if (mission.reward_diamonds > 0) reward += " + " + mission.reward_diamonds + " DIAMOND";
            return reward;
        }

        private static string TimeLabel(string value)
        {
            if (!DateTimeOffset.TryParse(value, out var at)) return "-";
            var remaining = at - DateTimeOffset.UtcNow;
            if (remaining.TotalSeconds <= 0) return "SEKARANG";
            if (remaining.TotalDays >= 1) return Mathf.CeilToInt((float)remaining.TotalDays) + " HARI";
            if (remaining.TotalHours >= 1) return Mathf.CeilToInt((float)remaining.TotalHours) + " JAM";
            return Mathf.Max(1, Mathf.CeilToInt((float)remaining.TotalMinutes)) + " MENIT";
        }

        private static Color EventColor(string accent)
        {
            switch ((accent ?? "").ToLowerInvariant())
            {
                case "rose": return CrwtUi.Rose;
                case "cyan": return CrwtUi.Cyan;
                case "mint": return CrwtUi.Mint;
                case "lavender": return CrwtUi.Lavender;
                default: return CrwtUi.Gold;
            }
        }

        private static string FriendlyMissionError(string message)
        {
            if (string.IsNullOrEmpty(message)) return "Server belum mengonfirmasi reward.";
            return message
                .Replace("mission_not_complete", "Mission belum selesai")
                .Replace("mission_already_claimed", "Reward sudah diambil")
                .Replace("mission_not_found", "Mission sudah tidak aktif");
        }

        private void ShowItemList(string type, string title, string intro)
        {
            hubSheet.Show(title, "lobby-" + type);
            hubSheet.Note(intro);
            hubSheet.Note(ProgressionSummary());
            var items = ItemsFor(type);
            if (items.Length == 0)
            {
                hubSheet.Note(CrwtSession.IsGuest
                    ? "Login untuk memuat koleksi akun."
                    : "Koleksi sedang disinkronkan. Tutup panel lalu buka kembali setelah progression termuat.");
                return;
            }

            foreach (var item in items)
            {
                if (item == null) continue;
                var id = item.id;
                var equipped = IsEquipped(type, id);
                var state = equipped ? "DIPAKAI"
                    : item.owned ? "DIMILIKI • LV " + item.level + "/" + item.max_level
                    : "TERKUNCI • " + UnlockLabel(item);
                CrwtUi.Button(hubSheet.Content,
                    item.name.ToUpperInvariant() + " • " + item.rarity + " • " + state,
                    () => ShowProgressionItem(type, id),
                    type == "character" ? CharacterColor(id) : type == "dice" ? CrwtUi.Lavender : CrwtUi.Cyan,
                    72);
            }
        }

        private void ShowCollection()
        {
            hubSheet.Show("KOLEKSI • WORLD TOUR", "lobby-collection");
            if (progression?.profile == null)
            {
                hubSheet.Note(ProgressionLine());
                return;
            }
            hubSheet.Note(ProgressionSummary());
            hubSheet.Note("LOADOUT • " + CrwtHudArt.CharacterDisplayName(progression.profile.character_id)
                + " • " + DiceName(progression.profile.dice_id)
                + "\nDECK • " + string.Join(" / ", progression.profile.deck ?? Array.Empty<string>()));
            hubSheet.Note("KARAKTER " + OwnedCount(progression.characters) + "/" + (progression.characters?.Length ?? 0)
                + "  •  DADU " + OwnedCount(progression.dice) + "/" + (progression.dice?.Length ?? 0)
                + "  •  KARTU " + OwnedCount(progression.cards) + "/" + (progression.cards?.Length ?? 0));
            foreach (var id in CrwtRuntimeConfig.MapIds)
                hubSheet.Note(CrwtRuntimeConfig.MapName(id) + " • " + MapDescription(id));
        }

        private void ShowShop()
        {
            hubSheet.Show("TOKO • COLLECTION UNLOCK", "lobby-shop");
            hubSheet.Note("Unlock memakai Gold/Diamond akun melalui RPC server. Tidak ada saldo yang dipotong lokal.");
            hubSheet.Note(ProgressionSummary());
            var locked = ItemsFor("character").Where(x => x != null && !x.owned)
                .Select(x => new { type = "character", item = x })
                .Concat(ItemsFor("dice").Where(x => x != null && !x.owned).Select(x => new { type = "dice", item = x }))
                .Concat(ItemsFor("card").Where(x => x != null && !x.owned).Select(x => new { type = "card", item = x }))
                .ToArray();
            if (locked.Length == 0)
            {
                hubSheet.Note(progression == null ? "Progression belum termuat." : "Semua item catalog saat ini sudah dimiliki.");
                return;
            }
            foreach (var entry in locked)
            {
                var type = entry.type; var id = entry.item.id;
                CrwtUi.Button(hubSheet.Content,
                    TypeLabel(type) + " • " + entry.item.name.ToUpperInvariant() + " • " + UnlockLabel(entry.item),
                    () => ShowProgressionItem(type, id), CrwtUi.Gold, 68);
            }
        }

        private void ShowProgressionItem(string type, string id)
        {
            var item = FindItem(type, id);
            if (item == null)
            {
                ShowHub(hubSection);
                return;
            }
            hubSheet.Show(item.name.ToUpperInvariant() + " • " + TypeLabel(type), "lobby-item");
            if (type == "character")
            {
                var portrait = CrwtHudArt.Portrait(hubSheet.Content, id);
                portrait.gameObject.AddComponent<LayoutElement>().preferredHeight = 170;
            }
            hubSheet.Note(item.rarity + " • " + (item.owned ? "LV " + item.level + "/" + item.max_level : "TERKUNCI")
                + "\n" + (string.IsNullOrEmpty(item.description) ? CharacterDescription(id) : item.description));
            if (!string.IsNullOrEmpty(item.skill_name))
                hubSheet.Note("SKILL • " + item.skill_name);
            if (!string.IsNullOrEmpty(item.effect_type))
                hubSheet.Note("EFEK • " + item.effect_type.Replace('_', ' ').ToUpperInvariant());

            if (!item.owned)
            {
                hubSheet.Note("HARGA UNLOCK • " + UnlockLabel(item));
                if (!CrwtSession.IsGuest)
                    CrwtUi.Button(hubSheet.Content, "BUKA ITEM", () => ConfirmUnlock(type, id), CrwtUi.Gold);
            }
            else
            {
                if (type == "character" || type == "dice")
                {
                    if (IsEquipped(type, id)) hubSheet.Note("STATUS • DIPAKAI UNTUK MATCH BERIKUTNYA");
                    else CrwtUi.Button(hubSheet.Content, "PAKAI", () => EquipItem(type, id), CrwtUi.Mint);
                }
                else ShowDeckAction(item);

                if (item.level < item.max_level)
                {
                    var cost = UpgradeCost(type, item.level);
                    CrwtUi.Button(hubSheet.Content, "UPGRADE KE LV " + (item.level + 1) + " • " + cost + " GOLD",
                        () => ConfirmUpgrade(type, id), CrwtUi.Gold);
                }
                else hubSheet.Note("LEVEL MAXIMUM TERCAPAI.");
            }

            CrwtUi.Button(hubSheet.Content, "KEMBALI", () => ShowHub(type == "card" ? "cards" : type), CrwtUi.Cyan);
        }

        private void ShowDeckAction(CrwtProgressionItem item)
        {
            var deck = progression?.profile?.deck ?? Array.Empty<string>();
            var inDeck = deck.Contains(item.id);
            hubSheet.Note("DECK AKTIF • " + string.Join(" / ", deck));
            if (inDeck)
            {
                if (deck.Length <= 1) hubSheet.Note("Deck minimal harus berisi 1 kartu.");
                else CrwtUi.Button(hubSheet.Content, "LEPAS DARI DECK", () => ToggleDeckCard(item.id, false), CrwtUi.Rose);
            }
            else
            {
                if (deck.Length >= 3) hubSheet.Note("Deck sudah penuh (maksimum 3 kartu).");
                else CrwtUi.Button(hubSheet.Content, "TAMBAHKAN KE DECK", () => ToggleDeckCard(item.id, true), CrwtUi.Mint);
            }
        }

        private void ConfirmUnlock(string type, string id)
        {
            var item = FindItem(type, id);
            if (item == null || item.owned) return;
            hubSheet.Show("KONFIRMASI UNLOCK", "lobby-confirm");
            hubSheet.Note(item.name + "\nHarga: " + UnlockLabel(item) + "\nSaldo: " + BalanceLine());
            CrwtUi.Button(hubSheet.Content, "YA, BUKA", () => UnlockItem(type, id), CrwtUi.Gold);
            CrwtUi.Button(hubSheet.Content, "BATAL", () => ShowProgressionItem(type, id), CrwtUi.Cyan);
        }

        private async void UnlockItem(string type, string id)
        {
            if (progressionBusy) return;
            progressionBusy = true;
            try
            {
                await CrwtAppRoot.Instance.Api.UnlockProgressionItemAsync(type, id);
                await RefreshProgression();
                if (!this) return;
                SetStatus("Unlock berhasil • " + (FindItem(type, id)?.name ?? id));
                ShowProgressionItem(type, id);
            }
            catch (Exception ex)
            {
                if (this) { ShowProgressionItem(type, id); hubSheet.Note("UNLOCK GAGAL • " + FriendlyProgressionError(ex.Message)); }
            }
            finally { progressionBusy = false; }
        }

        private void ConfirmUpgrade(string type, string id)
        {
            var item = FindItem(type, id);
            if (item == null || !item.owned || item.level >= item.max_level) return;
            var cost = UpgradeCost(type, item.level);
            hubSheet.Show("KONFIRMASI UPGRADE", "lobby-confirm");
            hubSheet.Note(item.name + " • LV " + item.level + " → " + (item.level + 1)
                + "\nBiaya: " + cost + " GOLD\nSaldo: " + BalanceLine());
            CrwtUi.Button(hubSheet.Content, "UPGRADE", () => UpgradeItem(type, id), CrwtUi.Gold);
            CrwtUi.Button(hubSheet.Content, "BATAL", () => ShowProgressionItem(type, id), CrwtUi.Cyan);
        }

        private async void UpgradeItem(string type, string id)
        {
            if (progressionBusy) return;
            progressionBusy = true;
            try
            {
                await CrwtAppRoot.Instance.Api.UpgradeProgressionItemAsync(type, id);
                await RefreshProgression();
                if (!this) return;
                SetStatus("Upgrade berhasil • " + (FindItem(type, id)?.name ?? id));
                ShowProgressionItem(type, id);
            }
            catch (Exception ex)
            {
                if (this) { ShowProgressionItem(type, id); hubSheet.Note("UPGRADE GAGAL • " + FriendlyProgressionError(ex.Message)); }
            }
            finally { progressionBusy = false; }
        }

        private async void EquipItem(string type, string id)
        {
            if (progressionBusy || progression?.profile == null) return;
            if (!string.IsNullOrEmpty(CrwtSession.RoomId))
            {
                hubSheet.Note("Keluar dari room terlebih dahulu untuk mengganti loadout match berikutnya.");
                return;
            }
            var character = type == "character" ? id : progression.profile.character_id;
            var dice = type == "dice" ? id : progression.profile.dice_id;
            await SaveLoadout(character, dice, progression.profile.deck, type, id);
        }

        private async void ToggleDeckCard(string id, bool add)
        {
            if (progressionBusy || progression?.profile == null) return;
            if (!string.IsNullOrEmpty(CrwtSession.RoomId))
            {
                hubSheet.Note("Keluar dari room terlebih dahulu untuk mengganti deck match berikutnya.");
                return;
            }
            var deck = (progression.profile.deck ?? Array.Empty<string>()).ToList();
            if (add)
            {
                if (deck.Count >= 3 || deck.Contains(id)) return;
                deck.Add(id);
            }
            else
            {
                if (deck.Count <= 1) return;
                deck.Remove(id);
            }
            await SaveLoadout(progression.profile.character_id, progression.profile.dice_id, deck.ToArray(), "card", id);
        }

        private async System.Threading.Tasks.Task SaveLoadout(string character, string dice, string[] deck, string returnType, string returnId)
        {
            if (progressionBusy) return;
            progressionBusy = true;
            try
            {
                progression = await CrwtAppRoot.Instance.Api.SetLoadoutAsync(character, dice, deck);
                if (!this) return;
                SetStatus("Loadout tersimpan • " + ProgressionSummary());
                ShowProgressionItem(returnType, returnId);
            }
            catch (Exception ex)
            {
                if (this) { ShowProgressionItem(returnType, returnId); hubSheet.Note("LOADOUT GAGAL • " + FriendlyProgressionError(ex.Message)); }
            }
            finally { progressionBusy = false; }
        }

        private CrwtProgressionItem[] ItemsFor(string type)
        {
            if (progression == null) return Array.Empty<CrwtProgressionItem>();
            return type == "character" ? progression.characters ?? Array.Empty<CrwtProgressionItem>()
                : type == "dice" ? progression.dice ?? Array.Empty<CrwtProgressionItem>()
                : progression.cards ?? Array.Empty<CrwtProgressionItem>();
        }

        private CrwtProgressionItem FindItem(string type, string id)
        {
            return ItemsFor(type).FirstOrDefault(x => x != null && x.id == id);
        }

        private bool IsEquipped(string type, string id)
        {
            var p = progression?.profile;
            if (p == null) return false;
            if (type == "character") return p.character_id == id;
            if (type == "dice") return p.dice_id == id;
            return (p.deck ?? Array.Empty<string>()).Contains(id);
        }

        private string ProgressionLine()
        {
            if (CrwtSession.IsGuest) return "DEMO OFFLINE • progression akun tidak dimuat.";
            return progression?.profile == null ? "Progression: menyinkronkan data akun..." : ProgressionSummary();
        }

        private string ProgressionSummary()
        {
            var p = progression?.profile;
            if (p == null) return ProgressionLineFallback();
            return "LV " + p.level + "  •  XP " + p.xp + "  •  GOLD " + p.gold + "  •  DIAMOND " + p.diamonds;
        }

        private string ProgressionLineFallback()
        {
            return CrwtSession.IsGuest ? "DEMO OFFLINE" : "Progression akun belum termuat.";
        }

        private string BalanceLine()
        {
            var p = progression?.profile;
            return p == null ? "belum termuat" : p.gold + " GOLD • " + p.diamonds + " DIAMOND";
        }

        private string DiceName(string id)
        {
            return progression?.dice?.FirstOrDefault(x => x != null && x.id == id)?.name ?? id ?? "Travel Dice";
        }

        private static int OwnedCount(CrwtProgressionItem[] items)
        {
            return items?.Count(x => x != null && x.owned) ?? 0;
        }

        private static string UnlockLabel(CrwtProgressionItem item)
        {
            if (item == null) return "-";
            if (item.unlock_currency == "free" || item.unlock_cost <= 0) return "GRATIS";
            return item.unlock_cost + " " + (item.unlock_currency ?? "gold").ToUpperInvariant();
        }

        private static int UpgradeCost(string type, int level)
        {
            var n = Mathf.Max(1, level);
            if (type == "character") return 800 * n + 100 * (n - 1) * (n - 1);
            if (type == "dice") return 600 * n + 75 * (n - 1) * (n - 1);
            return 350 * n + 50 * (n - 1) * (n - 1);
        }

        private static string TypeLabel(string type)
        {
            return type == "character" ? "KARAKTER" : type == "dice" ? "DADU" : "KARTU";
        }

        private static string FriendlyProgressionError(string message)
        {
            if (string.IsNullOrEmpty(message)) return "Server belum mengonfirmasi aksi.";
            return message
                .Replace("insufficient_gold", "Gold tidak cukup")
                .Replace("insufficient_diamonds", "Diamond tidak cukup")
                .Replace("item_not_owned", "Item belum dimiliki")
                .Replace("character_not_owned", "Karakter belum dimiliki")
                .Replace("dice_not_owned", "Dadu belum dimiliki")
                .Replace("deck_size_1_to_3", "Deck harus 1–3 kartu")
                .Replace("deck_duplicates_not_allowed", "Deck tidak boleh memiliki kartu duplikat")
                .Replace("max_level_reached", "Level maksimum sudah tercapai");
        }

        private static Color CharacterColor(string id) => CrwtCharacterView.NormalizeCharacterId(id) switch
        {
            "rindi" => CrwtUi.Rose,
            "kairo" => CrwtUi.Cyan,
            "luna" => CrwtUi.Lavender,
            "nox" => new Color(.56f,.40f,.82f),
            "atlas" => CrwtUi.Mint,
            _ => new Color(.55f,.76f,1f)
        };

        private static string CharacterDescription(string id) => CrwtCharacterView.NormalizeCharacterId(id) switch
        {
            "rindi" => "Traveler ceria dengan rambut pink twin-tail dan aksen teal.",
            "kairo" => "Strategist futuristik dengan identitas biru-cyan. Skill server: Dice Focus.",
            "luna" => "Traveler bertema moonlight dengan palet lavender dan gold.",
            "nox" => "Karakter misterius dengan palet midnight violet dan silver streak.",
            "atlas" => "Explorer dunia dengan topi perjalanan, mint accent, dan travel bag.",
            _ => "Alexia • silver-white bob, mata cyan, blazer navy-ivory, dan gold star."
        };

        private static Color MapColor(string map) => map switch
        {
            "tokyo_rush" => CrwtUi.Rose,
            "tropical_paradise" => CrwtUi.Mint,
            "candy_world" => new Color(1f,.67f,.36f),
            "fantasy_kingdom" => CrwtUi.Lavender,
            _ => CrwtUi.Cyan
        };

        private static string MapDescription(string map) => map switch
        {
            "tokyo_rush" => "Neon city • sakura • fast urban anime",
            "tropical_paradise" => "Turquoise resort • palms • summer adventure",
            "candy_world" => "Candy town • lollipop • bright fantasy",
            "fantasy_kingdom" => "Castle • crystal • magical kingdom",
            _ => "Global miniature cities • cloud & star travel"
        };

        private async void Logout()
        {
            if (leaving || roomActionBusy) return;
            leaving = true;
            if (CrwtSession.IsOnline)
            {
                if (!string.IsNullOrEmpty(CrwtSession.RoomId))
                    try { await CrwtAppRoot.Instance.Api.LeaveRoomAsync(CrwtSession.RoomId); } catch { }
                await CrwtAppRoot.Instance.Api.SignOutAsync();
            }
            else CrwtSession.ClearAuth();
            CrwtAppRoot.Instance.LoadLogin();
        }

        private void SetStatus(string value) { if (status) status.text = value; }

        private static Dropdown Dropdown(Transform parent, string[] options)
        {
            var go = new GameObject("MapDropdown", typeof(RectTransform), typeof(Image), typeof(Dropdown), typeof(LayoutElement));
            go.transform.SetParent(parent, false);
            CrwtUi.StyleImage(go.GetComponent<Image>(), new Color(.14f, .17f, .31f, 1));
            go.GetComponent<LayoutElement>().preferredHeight = 64;
            var dd = go.GetComponent<Dropdown>();
            var label = CrwtUi.Text(go.transform, options[0], 23, TextAnchor.MiddleLeft, Color.white);
            label.rectTransform.anchorMin = Vector2.zero; label.rectTransform.anchorMax = Vector2.one; label.rectTransform.offsetMin = new Vector2(18, 0); label.rectTransform.offsetMax = new Vector2(-42, 0);
            dd.captionText = label;
            dd.options.Clear();
            foreach (var o in options) dd.options.Add(new Dropdown.OptionData(o));
            var template = CrwtUi.Panel(go.transform, "Template", new Color(.08f, .10f, .16f, 1), new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, -300), new Vector2(0, 0));
            template.gameObject.SetActive(false);
            var viewport = CrwtUi.Panel(template, "Viewport", Color.clear, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            viewport.gameObject.AddComponent<RectMask2D>();
            var content = CrwtUi.Panel(viewport, "Content", Color.clear, new Vector2(0, 1), Vector2.one, new Vector2(0, -52), Vector2.zero);
            content.pivot = new Vector2(.5f,1);
            var scroll = template.gameObject.AddComponent<ScrollRect>(); scroll.viewport = viewport; scroll.content = content; scroll.horizontal = false; scroll.movementType = ScrollRect.MovementType.Clamped;
            var item = new GameObject("Item", typeof(RectTransform), typeof(Image), typeof(Toggle)); item.transform.SetParent(content, false);
            CrwtUi.StyleImage(item.GetComponent<Image>(), new Color(.16f,.20f,.34f,1));
            item.GetComponent<Toggle>().targetGraphic = item.GetComponent<Image>();
            var itemText = CrwtUi.Text(item.transform, "Option", 22, TextAnchor.MiddleLeft, Color.white); CrwtUi.Fill(itemText.rectTransform, 12);
            var itemRt = item.GetComponent<RectTransform>(); itemRt.anchorMin = new Vector2(0,1); itemRt.anchorMax = Vector2.one; itemRt.pivot = new Vector2(.5f,1); itemRt.sizeDelta = new Vector2(0, 52);
            dd.template = template;
            dd.itemText = itemText;
            dd.RefreshShownValue();
            return dd;
        }
    }
}
