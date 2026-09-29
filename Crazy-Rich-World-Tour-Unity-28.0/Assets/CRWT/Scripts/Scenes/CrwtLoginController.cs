using System;
using UnityEngine;
using UnityEngine.UI;

namespace ComePlayers.CrazyRich
{
    public sealed class CrwtLoginController : MonoBehaviour
    {
        private InputField email;
        private InputField password;
        private InputField displayName;
        private Text status;
        private bool busy;

        private void Start()
        {
            var canvas = CrwtUi.CreateCanvas("LoginUI");
            var bg = CrwtUi.Panel(CrwtUi.SafeRoot(canvas.transform), "Background", CrwtUi.Bg, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            CrwtHudArt.Backdrop(bg);
            var left = CrwtUi.Panel(bg, "Hero", new Color(0.03f, .05f, .10f, .30f), new Vector2(0, 0), new Vector2(.58f, 1), Vector2.zero, Vector2.zero);
            var lt = CrwtUi.Text(left, "CRAZY RICH\nWORLD TOUR\n\n30.0 • CHIBI WORLD", 58, TextAnchor.UpperLeft, Color.white);
            CrwtUi.Fill(lt.rectTransform, 70);

            var card = CrwtUi.Panel(bg, "LoginCard", CrwtUi.Card, new Vector2(.62f, .14f), new Vector2(.94f, .86f), Vector2.zero, Vector2.zero);
            CrwtUi.Vertical(card, 16, new RectOffset(36, 36, 36, 36));
            CrwtUi.Text(card, "Masuk ke ComePlayers", 34, TextAnchor.MiddleCenter, CrwtUi.Gold).gameObject.AddComponent<LayoutElement>().preferredHeight = 70;
            displayName = CrwtUi.Input(card, "Nama pemain");
            displayName.text = PlayerPrefs.GetString("crwt_display_name", "Mabar");
            email = CrwtUi.Input(card, "Email ComePlayers");
            password = CrwtUi.Input(card, "Password", true);
            CrwtUi.Button(card, "MASUK ONLINE", Login, CrwtUi.Gold);
            CrwtUi.Button(card, "DAFTAR", Register, CrwtUi.Cyan);
            CrwtUi.Button(card, "DEMO OFFLINE 3D", Guest, new Color(.65f, .68f, .76f));
            status = CrwtUi.Text(card, "Bangun kotamu. Jadilah pemain terakhir!", 19, TextAnchor.MiddleCenter, new Color(1, 1, 1, .65f));
            status.gameObject.AddComponent<LayoutElement>().preferredHeight = 60;
        }

        private async void Login()
        {
            if (busy) return;
            busy = true; SetStatus("Menghubungkan akun...");
            try
            {
                CrwtSession.DisplayName = string.IsNullOrWhiteSpace(displayName.text) ? "Player" : displayName.text.Trim();
                PlayerPrefs.SetString("crwt_display_name", CrwtSession.DisplayName);
                await CrwtAppRoot.Instance.Api.SignInAsync(email.text.Trim(), password.text);
                if (!this) return;
                await CrwtAppRoot.Instance.Api.BootstrapProgressionAsync();
                if (!this) return;
                CrwtAppRoot.Instance.LoadLobby();
            }
            catch (Exception ex) { SetStatus("Gagal: " + ex.Message); }
            finally { busy = false; }
        }

        private async void Register()
        {
            if (busy) return;
            busy = true; SetStatus("Membuat akun...");
            try
            {
                CrwtSession.DisplayName = string.IsNullOrWhiteSpace(displayName.text) ? "Player" : displayName.text.Trim();
                var session = await CrwtAppRoot.Instance.Api.SignUpAsync(email.text.Trim(), password.text);
                if (!this) return;
                if (string.IsNullOrEmpty(session?.access_token)) SetStatus("Pendaftaran berhasil. Cek email jika verifikasi diwajibkan, lalu MASUK ONLINE.");
                else
                {
                    await CrwtAppRoot.Instance.Api.BootstrapProgressionAsync();
                    if (!this) return;
                    CrwtAppRoot.Instance.LoadLobby();
                }
            }
            catch (Exception ex) { SetStatus("Gagal: " + ex.Message); }
            finally { busy = false; }
        }

        private void Guest()
        {
            if (busy) return;
            CrwtSession.ClearAuth();
            CrwtSession.IsGuest = true;
            CrwtSession.DisplayName = string.IsNullOrWhiteSpace(displayName.text) ? "Mabar" : displayName.text.Trim();
            PlayerPrefs.SetString("crwt_display_name", CrwtSession.DisplayName);
            CrwtAppRoot.Instance.LoadLobby();
        }

        private void SetStatus(string s) { if (status) status.text = s; }
    }
}
