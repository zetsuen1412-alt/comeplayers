using System;
using System.Text;
using Newtonsoft.Json.Linq;
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
        private string progressionRaw;
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

            var menu = CrwtUi.Panel(bg, "Menu", CrwtUi.Card, new Vector2(.04f, .10f), new Vector2(.38f, .84f), Vector2.zero, Vector2.zero);
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

            var room = CrwtUi.Panel(bg, "Room", new Color(.045f, .065f, .12f, .96f), new Vector2(.42f, .10f), new Vector2(.96f, .84f), Vector2.zero, Vector2.zero);
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
            if (!CrwtSession.IsGuest) { LoadProgression(); ResumeRoom(); }
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
            try
            {
                progressionRaw = await CrwtAppRoot.Instance.Api.ProgressionSnapshotAsync();
                if (!this) return;
                SetStatus(ProgressionSummary(progressionRaw));
            }
            catch
            {
                if (this) SetStatus("Progression online belum dapat dimuat. Matchmaking tetap tersedia.");
            }
        }

        private void ShowHub(string section)
        {
            if (!hubSheet) return;
            switch (section)
            {
                case "character":
                    hubSheet.Show("KARAKTER • Anime Travelers", "lobby-character");
                    hubSheet.Note("Enam karakter sudah tersedia di client. Pemilihan permanen tetap mengikuti progression/server; panel ini hanya preview.");
                    foreach (var id in new[] { "alexia", "rindi", "kairo", "luna", "nox", "atlas" })
                    {
                        var characterId = id;
                        CrwtUi.Button(hubSheet.Content, CrwtHudArt.CharacterDisplayName(id) + " • LIHAT PROFIL",
                            () => ShowCharacterProfile(characterId), CharacterColor(id), 64);
                    }
                    break;
                case "dice":
                    hubSheet.Show("DADU • STARWHEEL", "lobby-dice");
                    hubSheet.Note("Starwheel adalah dadu fantasi tujuh hasil: 0–6. Hasil online tetap berasal dari server, bukan dari Unity.");
                    hubSheet.Note(ProgressionLine("dice"));
                    hubSheet.Note("ZERO + ZERO tetap berada di tempat. Focus GANJIL/GENAP dan extra roll mengikuti kontrak server.");
                    break;
                case "cards":
                    hubSheet.Show("KARTU • COLLECTION", "lobby-cards");
                    hubSheet.Note("Kartu digunakan saat pertandingan ketika server memberikan kartu ke tangan pemain.");
                    hubSheet.Note(ProgressionLine("cards"));
                    hubSheet.Note("Target, validasi, dan efek kartu tetap diputuskan server. Lobby tidak membuat kartu baru.");
                    break;
                case "collection":
                    hubSheet.Show("KOLEKSI • WORLD TOUR", "lobby-collection");
                    hubSheet.Note("6 karakter 3D • 5 map • 160 tile katalog • House / Tower / Hotel / Landmark.");
                    hubSheet.Note(ProgressionLine("collection"));
                    foreach (var id in CrwtRuntimeConfig.MapIds)
                        hubSheet.Note(CrwtRuntimeConfig.MapName(id) + " • " + MapDescription(id));
                    break;
                case "shop":
                    hubSheet.Show("TOKO • FOUNDATION", "lobby-shop");
                    hubSheet.Note("Tampilan toko siap menjadi bagian Main Lobby, tetapi Unity client belum memiliki RPC pembelian toko yang eksplisit.");
                    hubSheet.Note("Tidak ada transaksi lokal atau tombol beli palsu. Purchase akan diaktifkan setelah kontrak server resmi tersedia.");
                    break;
                default:
                    hubSheet.Show("EVENT • WORLD TOUR", "lobby-event");
                    hubSheet.Note("Panel Event sudah berada di Main Lobby. Sistem pertandingan Festival tetap aktif di board.");
                    hubSheet.Note("Event lobby global belum memiliki endpoint khusus di Unity client, jadi panel ini read-only sampai backend event resmi ditambahkan.");
                    break;
            }
        }

        private void ShowCharacterProfile(string id)
        {
            hubSheet.Show(CrwtHudArt.CharacterDisplayName(id) + " • CHARACTER", "lobby-character");
            var portrait = CrwtHudArt.Portrait(hubSheet.Content, id);
            portrait.gameObject.AddComponent<LayoutElement>().preferredHeight = 180;
            hubSheet.Note(CharacterDescription(id));
            hubSheet.Note("Model 3D: Idle / Walk / Jump / Skill / Win / Lose tersedia dalam paket Unity.");
            CrwtUi.Button(hubSheet.Content, "KEMBALI KE KARAKTER", () => ShowHub("character"), CrwtUi.Cyan);
        }

        private void UpdateMapStatus()
        {
            if (!status) return;
            status.text = CrwtRuntimeConfig.MapName(CrwtSession.SelectedMapId) + "\n" + MapDescription(CrwtSession.SelectedMapId);
            status.color = MapColor(CrwtSession.SelectedMapId);
        }

        private string ProgressionLine(string section)
        {
            if (CrwtSession.IsGuest) return "DEMO OFFLINE • progression akun tidak dimuat.";
            if (string.IsNullOrWhiteSpace(progressionRaw)) return "Progression: menyinkronkan data akun...";
            var summary = ProgressionSummary(progressionRaw);
            return string.IsNullOrEmpty(summary) ? "Progression akun terhubung." : summary;
        }

        private static string ProgressionSummary(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return null;
            try
            {
                var root = JToken.Parse(json);
                var parts = new System.Collections.Generic.List<string>();
                AddProgression(parts, root, "level", "LV");
                AddProgression(parts, root, "xp", "XP");
                AddProgression(parts, root, "gold", "GOLD");
                AddProgression(parts, root, "rating", "RATING");
                AddProgression(parts, root, "tier", "TIER");
                return parts.Count == 0 ? "Progression akun tersinkron." : string.Join("  •  ", parts);
            }
            catch { return "Progression akun tersinkron."; }
        }

        private static void AddProgression(System.Collections.Generic.List<string> output, JToken root, string key, string label)
        {
            var value = FindValue(root, key);
            if (value == null || value.Type == JTokenType.Null || value.Type == JTokenType.Object || value.Type == JTokenType.Array) return;
            var text = value.ToString();
            if (!string.IsNullOrWhiteSpace(text) && !output.Exists(x => x.StartsWith(label + " ")))
                output.Add(label + " " + text);
        }

        private static JToken FindValue(JToken token, string name)
        {
            if (token is JObject obj)
            {
                foreach (var property in obj.Properties())
                {
                    if (string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase)) return property.Value;
                    var nested = FindValue(property.Value, name);
                    if (nested != null) return nested;
                }
            }
            else if (token is JArray array)
            {
                foreach (var child in array)
                {
                    var nested = FindValue(child, name);
                    if (nested != null) return nested;
                }
            }
            return null;
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
            "kairo" => "Strategist futuristik dengan identitas biru-cyan dan Dice Focus.",
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
