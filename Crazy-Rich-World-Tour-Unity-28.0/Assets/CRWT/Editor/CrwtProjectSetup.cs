#if UNITY_EDITOR
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using ComePlayers.CrazyRich;

namespace ComePlayers.CrazyRich.Editor
{
    [InitializeOnLoad]
    public static class CrwtProjectSetup
    {
        private const string SceneDir = "Assets/CRWT/Scenes";
        private const string Marker = "Assets/CRWT/.setup29";

        static CrwtProjectSetup()
        {
            EditorApplication.delayCall += Ensure;
        }

        [MenuItem("Crazy Rich/29.0/Setup Project")]
        public static void Ensure()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode) return;
            Directory.CreateDirectory(SceneDir);
            CreateScene("CRWT_Bootstrap", typeof(CrwtAppRoot));
            CreateScene("CRWT_Login", typeof(CrwtLoginController));
            CreateScene("CRWT_Lobby", typeof(CrwtLobbyController));
            CreateScene("CRWT_Match", typeof(CrwtMatchController));

            EditorBuildSettings.scenes = new[]
            {
                new EditorBuildSettingsScene(SceneDir + "/CRWT_Bootstrap.unity", true),
                new EditorBuildSettingsScene(SceneDir + "/CRWT_Login.unity", true),
                new EditorBuildSettingsScene(SceneDir + "/CRWT_Lobby.unity", true),
                new EditorBuildSettingsScene(SceneDir + "/CRWT_Match.unity", true)
            };
            PlayerSettings.companyName = "ComePlayers";
            PlayerSettings.productName = "Crazy Rich World Tour";
            PlayerSettings.bundleVersion = "29.0";
            PlayerSettings.defaultScreenWidth = 1920;
            PlayerSettings.defaultScreenHeight = 1080;
            PlayerSettings.runInBackground = true;
            File.WriteAllText(Marker, "CRWT Unity 29.0 Zero Dice System setup complete.\n");
            AssetDatabase.Refresh();
            Debug.Log("[CRWT 29] Scene + Build Settings siap. Buka CRWT_Bootstrap lalu Play.");
        }

        private static void CreateScene(string name, System.Type controller)
        {
            var path = SceneDir + "/" + name + ".unity";
            if (File.Exists(path)) return;
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var root = new GameObject(name + "_Root");
            root.AddComponent(controller);
            EditorSceneManager.SaveScene(scene, path);
        }
    }
}
#endif
