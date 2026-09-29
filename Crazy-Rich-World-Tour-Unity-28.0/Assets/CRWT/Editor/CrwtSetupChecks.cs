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
            var initialScenes = CaptureOpenScenes();
            var original = SceneManager.GetActiveScene();
            int initialPreviews = EditorSceneManager.previewSceneCount;
            CrwtProjectSetup.Ensure();
            AssertPreserved(initialScenes, original, initialPreviews);
            var writes = CrwtProjectSetup.ScenePaths.Select(File.GetLastWriteTimeUtc).ToArray();
            var settings = EditorBuildSettings.scenes.Select(scene => scene.path + scene.enabled).ToArray();
            // Unity cannot create a second ordinary untitled scene. Keep any
            // existing one intact and use an owned preview fixture in that case.
            bool preview = initialScenes.Any(state => string.IsNullOrEmpty(state.path));
            var sentinel = preview ? EditorSceneManager.NewPreviewScene()
                : EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);
            GameObject unsaved = null;
            try
            {
                if (!preview) SceneManager.SetActiveScene(sentinel);
                unsaved = EditorUtility.CreateGameObjectWithHideFlags(
                    "CRWT_Setup_Preservation_Check", HideFlags.HideAndDontSave);
                if (unsaved.scene != sentinel) SceneManager.MoveGameObjectToScene(unsaved, sentinel);
                unsaved.hideFlags = HideFlags.None;
                unsaved.transform.position = new Vector3(1.25f,2.5f,-3.75f);
                EditorSceneManager.MarkSceneDirty(sentinel);
                int count = SceneManager.sceneCount;
                int previews = EditorSceneManager.previewSceneCount;
                var active = SceneManager.GetActiveScene();
                CrwtProjectSetup.Ensure();
                CrwtProjectSetup.Ensure();
                if (!sentinel.isLoaded || !sentinel.isDirty || !unsaved || SceneManager.GetActiveScene() != active)
                    throw new InvalidOperationException("Setup did not preserve an unsaved scene and its active state.");
                if (SceneManager.sceneCount != count || EditorSceneManager.previewSceneCount != previews
                    || unsaved.transform.position != new Vector3(1.25f,2.5f,-3.75f))
                    throw new InvalidOperationException("Setup modified the editor's open scene content.");
                if (!writes.SequenceEqual(CrwtProjectSetup.ScenePaths.Select(File.GetLastWriteTimeUtc)))
                    throw new InvalidOperationException("Repeated setup rewrote an existing scene.");
                if (!settings.SequenceEqual(EditorBuildSettings.scenes.Select(scene => scene.path + scene.enabled)))
                    throw new InvalidOperationException("Repeated setup changed the scene list.");
            }
            finally
            {
                if (unsaved && unsaved.scene != sentinel) UnityEngine.Object.DestroyImmediate(unsaved);
                if (original.IsValid() && original.isLoaded) SceneManager.SetActiveScene(original);
                if (preview) EditorSceneManager.ClosePreviewScene(sentinel);
                else EditorSceneManager.CloseScene(sentinel, true);
            }
            AssertPreserved(initialScenes, original, initialPreviews);
            Debug.Log("[CRWT 30] Repeated setup preserved unsaved scene content, active scene and existing scene files.");
        }

        private sealed class SceneState
        {
            public Scene scene;
            public string path;
            public bool loaded, dirty;
            public int[] roots;
        }

        private static SceneState[] CaptureOpenScenes()
        {
            return Enumerable.Range(0, SceneManager.sceneCount).Select(index =>
            {
                var scene = SceneManager.GetSceneAt(index);
                return new SceneState
                {
                    scene = scene, path = scene.path, loaded = scene.isLoaded, dirty = scene.isDirty,
                    roots = scene.isLoaded ? scene.GetRootGameObjects().Select(root => root.GetInstanceID()).ToArray()
                        : Array.Empty<int>()
                };
            }).ToArray();
        }

        private static void AssertPreserved(SceneState[] scenes, Scene active, int previews)
        {
            if (SceneManager.sceneCount != scenes.Length || SceneManager.GetActiveScene() != active
                || EditorSceneManager.previewSceneCount != previews)
                throw new InvalidOperationException("Setup changed the user's scene layout or leaked a preview scene.");
            for (int i = 0; i < scenes.Length; i++)
            {
                var before = scenes[i];
                var after = SceneManager.GetSceneAt(i);
                if (after != before.scene || after.path != before.path || after.isLoaded != before.loaded
                    || after.isDirty != before.dirty || (after.isLoaded
                        && !after.GetRootGameObjects().Select(root => root.GetInstanceID()).SequenceEqual(before.roots)))
                    throw new InvalidOperationException("Setup changed an existing scene, including its unsaved/clean state.");
            }
        }
    }
}
#endif
