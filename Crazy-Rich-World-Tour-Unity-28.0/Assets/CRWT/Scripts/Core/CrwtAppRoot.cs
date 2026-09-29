using UnityEngine;
using UnityEngine.SceneManagement;

namespace ComePlayers.CrazyRich
{
    public sealed class CrwtAppRoot : MonoBehaviour
    {
        public static CrwtAppRoot Instance { get; private set; }
        public CrwtSupabaseClient Api { get; private set; }

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);
            Application.targetFrameRate = 60;
            Api = new CrwtSupabaseClient();
        }

        private void Start()
        {
            if (SceneManager.GetActiveScene().name == "CRWT_Bootstrap") LoadLogin();
        }

        public void LoadLogin() => SceneManager.LoadScene("CRWT_Login");
        public void LoadLobby() => SceneManager.LoadScene("CRWT_Lobby");
        public void LoadMatch() => SceneManager.LoadScene("CRWT_Match");
    }
}
