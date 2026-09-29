#if UNITY_EDITOR
using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace ComePlayers.CrazyRich.Editor
{
    public static class CrwtSetupChecks
    {
        [MenuItem("Crazy Rich/30.0/Check Setup Preservation")]
        public static void Run()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
                throw new InvalidOperationException("Stop Play Mode before checking editor setup.");
            CrwtProjectSetup.Ensure();
            var original = SceneManager.GetActiveScene();
            var writes = CrwtProjectSetup.ScenePaths.Select(File.GetLastWriteTimeUtc).ToArray();
            var settings = EditorBuildSettings.scenes.Select(scene => scene.path + scene.enabled).ToArray();
            var sentinel = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);
            try
            {
                SceneManager.SetActiveScene(sentinel);
                var unsaved = new GameObject("CRWT_Setup_Preservation_Check");
                SceneManager.MoveGameObjectToScene(unsaved, sentinel);
                unsaved.transform.position = new Vector3(1.25f,2.5f,-3.75f);
                EditorSceneManager.MarkSceneDirty(sentinel);
                int count = SceneManager.sceneCount;
                CrwtProjectSetup.Ensure();
                CrwtProjectSetup.Ensure();
                if (!sentinel.isLoaded || !sentinel.isDirty || !unsaved || SceneManager.GetActiveScene() != sentinel)
                    throw new InvalidOperationException("Setup did not preserve an unsaved scene and its active state.");
                if (SceneManager.sceneCount != count || unsaved.transform.position != new Vector3(1.25f,2.5f,-3.75f))
                    throw new InvalidOperationException("Setup modified the editor's open scene content.");
                if (!writes.SequenceEqual(CrwtProjectSetup.ScenePaths.Select(File.GetLastWriteTimeUtc)))
                    throw new InvalidOperationException("Repeated setup rewrote an existing scene.");
                if (!settings.SequenceEqual(EditorBuildSettings.scenes.Select(scene => scene.path + scene.enabled)))
                    throw new InvalidOperationException("Repeated setup changed the scene list.");
            }
            finally
            {
                if (original.IsValid() && original.isLoaded) SceneManager.SetActiveScene(original);
                EditorSceneManager.CloseScene(sentinel, true);
            }
            Debug.Log("[CRWT 30] Repeated setup preserved unsaved scene content, active scene and existing scene files.");
        }
    }
}
#endif
