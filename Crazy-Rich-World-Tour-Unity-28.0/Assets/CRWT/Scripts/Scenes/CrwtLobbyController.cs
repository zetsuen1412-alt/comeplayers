using System;
using System.Text;
using UnityEngine;
using UnityEngine.UI;

namespace ComePlayers.CrazyRich
{
    public sealed class CrwtLobbyController : MonoBehaviour
    {
        private Dropdown map;
        private InputField joinCode;
        private Text roomInfo;
        private Text status;
        private Button readyButton;
        private Button addBotButton;
        private Button startButton;
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
            map.onValueChanged.AddListener(i => CrwtSession.SelectedMapId = CrwtRuntimeConfig.MapIds[Mathf.Clamp(i, 0, CrwtRuntimeConfig.MapIds.Length - 1)]);

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
            status = CrwtUi.Text(menu, "Map: " + CrwtRuntimeConfig.MapName(CrwtSession.SelectedMapId), 18, TextAnchor.MiddleCenter, new Color(1, 1, 1, .6f));
            status.gameObject.AddComponent<LayoutElement>().preferredHeight = 80;

            var room = CrwtUi.Panel(bg, "Room", new Color(.045f, .065f, .12f, .96f), new Vector2(.42f, .10f), new Vector2(.96f, .84f), Vector2.zero, Vector2.zero);
            CrwtUi.Vertical(room, 14, new RectOffset(28, 28, 28, 28));
            roomInfo = CrwtUi.Text(room, CrwtSession.IsGuest ? "Pilih map lalu MAIN DEMO 3D." : "Belum berada di room.", 24, TextAnchor.UpperLeft, Color.white);
            roomInfo.gameObject.AddComponent<LayoutElement>().preferredHeight = 390;
            readyButton = CrwtUi.Button(room, "READY", ToggleReady, CrwtUi.Cyan);
            addBotButton = CrwtUi.Button(room, "+ BOT", AddBot, new Color(.65f, .82f, .60f));
            startButton = CrwtUi.Button(room, "START MATCH", StartMatch, CrwtUi.Gold);
            readyButton.gameObject.SetActive(false); addBotButton.gameObject.SetActive(false); startButton.gameObject.SetActive(false);

            if (!CrwtSession.IsGuest) ResumeRoom();
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
            var sb = new StringBuilder();
            sb.AppendLine(data.room.name + "   [" + data.room.code + "]");
            sb.AppendLine(CrwtRuntimeConfig.MapName(data.room.map_id) + " • " + data.room.mode.ToUpperInvariant() + " • LAST PLAYER STANDING");
            sb.AppendLine();
            selfReady = false; selfHost = false;
            foreach (var m in data.members ?? Array.Empty<CrwtRoomMember>())
            {
                var mine = m.user_id == CrwtSession.UserId;
                if (mine) { selfReady = m.ready; selfHost = m.is_host; }
                sb.AppendLine("Seat " + m.seat + " • " + m.display_name + " • " + (m.ready ? "READY" : "WAIT") + (m.is_host ? " • HOST" : "") + (!string.IsNullOrEmpty(m.bot_key) ? " • BOT" : ""));
            }
            roomInfo.text = sb.ToString();
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
