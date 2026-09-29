#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace ComePlayers.CrazyRich.Editor
{
    public static class CrwtBuildMenu
    {
        [MenuItem("Crazy Rich/30.0/Play Mode Smoke Test")]
        public static void PlayMode()
        {
            try { CrwtRuntimeSmoke.Run(); }
            catch (Exception ex)
            {
                WriteResult("PlayMode", false, ex.Message);
                if (Application.isBatchMode) { Debug.LogException(ex); EditorApplication.Exit(1); }
                else throw;
            }
        }

        [MenuItem("Crazy Rich/30.0/Verify Project")]
        public static void Verify() => Execute("Verify", () =>
        {
            CrwtProjectSetup.Ensure();
            CrwtRuntimeShaderChecks.Run();
            ValidateInput();
            CrwtDiceChecks.Run();
            CrwtBoardChecks.Run();
            CrwtSetupChecks.Run();
            Debug.Log("[CRWT 30] Editor compilation, scene and protocol checks passed. Device QA is separate.");
        });

        [MenuItem("Crazy Rich/30.0/Build Windows")]
        public static void BuildWindows() => Execute("Windows", () => Build(new BuildPlayerOptions
        {
            scenes = CrwtProjectSetup.ScenePaths,
            locationPathName = "Builds/Windows/CrazyRichWorldTour.exe",
            target = BuildTarget.StandaloneWindows64,
            options = BuildOptions.None
        }));

        [MenuItem("Crazy Rich/30.0/Build Android APK")]
        public static void BuildAndroid() => Execute("Android", () =>
        {
            var backend = PlayerSettings.GetScriptingBackend(NamedBuildTarget.Android);
            var architectures = PlayerSettings.Android.targetArchitectures;
            bool appBundle = EditorUserBuildSettings.buildAppBundle;
            try
            {
                PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
                PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
                EditorUserBuildSettings.buildAppBundle = false;
                Build(new BuildPlayerOptions
                {
                    scenes = CrwtProjectSetup.ScenePaths,
                    locationPathName = "Builds/Android/CrazyRichWorldTour-30.apk",
                    target = BuildTarget.Android,
                    options = BuildOptions.None
                });
            }
            finally
            {
                PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, backend);
                PlayerSettings.Android.targetArchitectures = architectures;
                EditorUserBuildSettings.buildAppBundle = appBundle;
            }
        });

        private static void Build(BuildPlayerOptions options)
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
                throw new BuildFailedException("Stop Play Mode before building.");
            bool dirty = false;
            for (int i = 0; i < SceneManager.sceneCount; i++) dirty |= SceneManager.GetSceneAt(i).isDirty;
            if (dirty && (Application.isBatchMode || !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()))
                throw new BuildFailedException("Build cancelled: save the open scenes first.");
            // Don't Save must not silently produce a stale build.
            for (int i = 0; i < SceneManager.sceneCount; i++)
                if (SceneManager.GetSceneAt(i).isDirty)
                    throw new BuildFailedException("Build cancelled: there are still unsaved scene changes.");
            var group = BuildPipeline.GetBuildTargetGroup(options.target);
            if (!BuildPipeline.IsBuildTargetSupported(group, options.target))
                throw new BuildFailedException("Install Unity build support for " + options.target + " via Unity Hub.");
            if (EditorUserBuildSettings.activeBuildTarget != options.target)
                throw new BuildFailedException("Switch the active platform to " + options.target + " first, or use tools/Invoke-Unity.ps1.");
            CrwtProjectSetup.Ensure();
            ValidateInput();
            CrwtDiceChecks.Run();
            CrwtBoardChecks.Run();
            Directory.CreateDirectory(Path.GetDirectoryName(options.locationPathName));
            var report = BuildPipeline.BuildPlayer(options);
            if (report.summary.result != BuildResult.Succeeded || !File.Exists(options.locationPathName))
                throw new BuildFailedException("Build " + report.summary.result + ": " + report.summary.totalErrors + " errors. See the Unity log.");
            Debug.Log("[CRWT 30] Build succeeded: " + options.locationPathName + " (" + report.summary.totalSize + " bytes).");
        }

        private static void ValidateInput()
        {
            var settings = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset");
            if (settings.Length == 0) throw new BuildFailedException("Player Settings are not available.");
            var activeInput = new SerializedObject(settings[0]).FindProperty("activeInputHandler");
            if (activeInput != null && activeInput.intValue == 1)
                throw new BuildFailedException("The mouse/touch UI uses Input Manager. Set Active Input Handling to Input Manager (Old) or Both, then restart Unity.");
        }

        private static void Execute(string task, Action action)
        {
            try { action(); WriteResult(task, true, ""); }
            catch (Exception ex) { WriteResult(task, false, ex.Message); throw; }
        }

        internal static void WriteResult(string task, bool success, string error)
        {
            if (!Application.isBatchMode) return;
            var args = Environment.GetCommandLineArgs();
            string runId = "";
            for (int i = 0; i + 1 < args.Length; i++) if (args[i] == "-crwtRunId") runId = args[i + 1];
            Directory.CreateDirectory("Logs");
            File.WriteAllText("Logs/unity-task-result.json", JsonUtility.ToJson(new TaskResult
            {
                task = task, runId = runId, success = success,
                unityVersion = Application.unityVersion, error = error
            }, true));
        }

        [Serializable]
        private sealed class TaskResult
        {
            public string task, runId, unityVersion, error;
            public bool success;
        }
    }
}
#endif
