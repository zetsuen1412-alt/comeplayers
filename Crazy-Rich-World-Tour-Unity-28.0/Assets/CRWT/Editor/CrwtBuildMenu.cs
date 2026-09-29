#if UNITY_EDITOR
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace ComePlayers.CrazyRich.Editor
{
    public static class CrwtBuildMenu
    {
        private static string[] Scenes => new[]
        {
            "Assets/CRWT/Scenes/CRWT_Bootstrap.unity",
            "Assets/CRWT/Scenes/CRWT_Login.unity",
            "Assets/CRWT/Scenes/CRWT_Lobby.unity",
            "Assets/CRWT/Scenes/CRWT_Match.unity"
        };

        [MenuItem("Crazy Rich/29.0/Build Windows")]
        public static void BuildWindows()
        {
            Directory.CreateDirectory("Builds/Windows");
            Build(new BuildPlayerOptions { scenes = Scenes, locationPathName = "Builds/Windows/CrazyRichWorldTour.exe", target = BuildTarget.StandaloneWindows64, options = BuildOptions.None });
        }

        [MenuItem("Crazy Rich/29.0/Build Android APK")]
        public static void BuildAndroid()
        {
            Directory.CreateDirectory("Builds/Android");
            Build(new BuildPlayerOptions { scenes = Scenes, locationPathName = "Builds/Android/CrazyRichWorldTour-29.apk", target = BuildTarget.Android, options = BuildOptions.None });
        }

        private static void Build(BuildPlayerOptions options)
        {
            var report = BuildPipeline.BuildPlayer(options);
            Debug.Log("[CRWT 29] Build result: " + report.summary.result + " • " + report.summary.totalSize + " bytes");
        }
    }
}
#endif
