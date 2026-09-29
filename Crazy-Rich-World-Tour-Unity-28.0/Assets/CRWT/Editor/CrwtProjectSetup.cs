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
    [InitializeOnLoad]
    public static class CrwtProjectSetup
    {
        private const string SceneDir = "Assets/CRWT/Scenes";
        // Editor state belongs in Library; writing it cannot trigger an asset import loop.
        private const string Marker = "Library/CRWT/setup-30.complete";
        private const string UiShaderMarker = "Library/CRWT/setup-30-ui-shaders.complete";
        private const string StandardMaterialPath = "Assets/CRWT/Resources/Materials/CRWT_Standard.mat";
        private static readonly string[] RuntimeShaders = { "glTF/PbrMetallicRoughness" };
        public static readonly string[] ScenePaths =
        {
            SceneDir + "/CRWT_Bootstrap.unity", SceneDir + "/CRWT_Login.unity",
            SceneDir + "/CRWT_Lobby.unity", SceneDir + "/CRWT_Match.unity"
        };
        private static readonly Type[] Controllers =
        {
            typeof(CrwtAppRoot), typeof(CrwtLoginController),
            typeof(CrwtLobbyController), typeof(CrwtMatchController)
        };

        static CrwtProjectSetup()
        {
            if (!Application.isBatchMode) EditorApplication.delayCall += AutoEnsure;
        }

        private static void AutoEnsure()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode) return;
            if (File.Exists(Marker) && File.Exists(UiShaderMarker) && ScenePaths.All(File.Exists)
                && File.Exists(StandardMaterialPath)) return;
            if (EditorApplication.isCompiling || EditorApplication.isUpdating)
            {
                EditorApplication.delayCall += AutoEnsure;
                return;
            }
            try { Ensure(); }
            catch (Exception ex) { Debug.LogException(ex); }
        }

        [MenuItem("Crazy Rich/30.0/Setup Project")]
        public static void Ensure()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
                throw new InvalidOperationException("Stop Play Mode before setting up the project.");
            // Unity permits only one ordinary untitled scene. Never save or
            // discard user work to get around that restriction.
            if (ScenePaths.Any(path => !File.Exists(path)))
            {
                for (int i = 0; i < SceneManager.sceneCount; i++)
                {
                    var open = SceneManager.GetSceneAt(i);
                    if (string.IsNullOrEmpty(open.path) && !IsEmptyStartupScene(open))
                        throw new InvalidOperationException("Required Crazy Rich scenes are missing. Save the open untitled scene, then run Setup Project again. Your scene has not been changed.");
                }
            }
            Directory.CreateDirectory(SceneDir);
            for (int i = 0; i < ScenePaths.Length; i++) CreateMissingScene(ScenePaths[i], Controllers[i]);

            // Required scenes first; retain extra scenes a developer has registered.
            var scenes = ScenePaths.Select(path => new EditorBuildSettingsScene(path, true)).ToList();
            scenes.AddRange(EditorBuildSettings.scenes.Where(scene => !ScenePaths.Contains(scene.path)));
            if (!EditorBuildSettings.scenes.Select(scene => scene.path + scene.enabled)
                .SequenceEqual(scenes.Select(scene => scene.path + scene.enabled)))
                EditorBuildSettings.scenes = scenes.ToArray();

            if (!File.Exists(Marker))
            {
                PlayerSettings.companyName = "ComePlayers";
                PlayerSettings.productName = CrwtRuntimeConfig.ProductName;
                PlayerSettings.defaultScreenWidth = 1920;
                PlayerSettings.defaultScreenHeight = 1080;
                PlayerSettings.runInBackground = true;
                PlayerSettings.defaultInterfaceOrientation = UIOrientation.AutoRotation;
                PlayerSettings.allowedAutorotateToLandscapeLeft = true;
                PlayerSettings.allowedAutorotateToLandscapeRight = true;
                PlayerSettings.allowedAutorotateToPortrait = false;
                PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;
            }
            if (PlayerSettings.bundleVersion != CrwtRuntimeConfig.ClientVersion)
                PlayerSettings.bundleVersion = CrwtRuntimeConfig.ClientVersion;
            EnsureStandardMaterial();
            EnsureRuntimeShaders();
            EnsureUiInputBindings();
            EnsureArtTextureImports();
            ValidateScenes();
            Directory.CreateDirectory(Path.GetDirectoryName(Marker));
            if (!File.Exists(Marker)) File.WriteAllText(Marker, "CRWT 30.0 scene setup complete.\n");
            if (!File.Exists(UiShaderMarker)) File.WriteAllText(UiShaderMarker, "CRWT runtime UI shader retained.\n");
            Debug.Log("[CRWT 30] Setup complete; existing scenes and unsaved editor work were preserved.");
        }

        private static void CreateMissingScene(string path, Type controller)
        {
            if (File.Exists(path)) return;
            var previous = SceneManager.GetActiveScene();
            bool emptyStartup = IsEmptyStartupScene(previous);
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,
                emptyStartup ? NewSceneMode.Single : NewSceneMode.Additive);
            try
            {
                // New objects must be created directly in our owned scene, so
                // creating then moving them cannot dirty a user's clean scene.
                if (SceneManager.GetActiveScene() != scene) SceneManager.SetActiveScene(scene);
                if (SceneManager.GetActiveScene() != scene)
                    throw new InvalidOperationException("Could not activate the generated scene: " + path);
                var root = new GameObject(Path.GetFileNameWithoutExtension(path) + "_Root");
                root.AddComponent(controller);
                if (!EditorSceneManager.SaveScene(scene, path))
                    throw new IOException("Could not save generated scene: " + path);
            }
            finally
            {
                if (emptyStartup)
                {
                    // Only an initially clean, completely empty startup scene
                    // is replaced. Restore that same empty editor state.
                    EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                }
                else
                {
                    if (previous.IsValid() && previous.isLoaded) SceneManager.SetActiveScene(previous);
                    EditorSceneManager.CloseScene(scene, true);
                }
            }
        }

        private static bool IsEmptyStartupScene(Scene scene)
        {
            return SceneManager.sceneCount == 1 && scene.IsValid() && scene.isLoaded
                && string.IsNullOrEmpty(scene.path) && !scene.isDirty && scene.rootCount == 0;
        }

        public static void ValidateScenes()
        {
            var previous = SceneManager.GetActiveScene();
            try
            {
                for (int i = 0; i < ScenePaths.Length; i++)
                {
                    var path = ScenePaths[i];
                    if (!File.Exists(path)) throw new FileNotFoundException("Required scene is missing.", path);
                    var scene = SceneManager.GetSceneByPath(path);
                    bool openedHere = !scene.IsValid() || !scene.isLoaded;
                    if (openedHere) scene = EditorSceneManager.OpenPreviewScene(path);
                    try
                    {
                        int controllers = 0;
                        foreach (var root in scene.GetRootGameObjects())
                        {
                            controllers += root.GetComponentsInChildren(Controllers[i], true).Length;
                            foreach (var transform in root.GetComponentsInChildren<Transform>(true))
                                if (GameObjectUtility.GetMonoBehavioursWithMissingScriptCount(transform.gameObject) != 0)
                                    throw new InvalidOperationException("Missing script in " + path + ": " + transform.name);
                        }
                        if (controllers != 1)
                            throw new InvalidOperationException(path + " must contain exactly one " + Controllers[i].Name + ".");
                    }
                    finally { if (openedHere) EditorSceneManager.ClosePreviewScene(scene); }
                }
            }
            finally { if (previous.IsValid() && previous.isLoaded) SceneManager.SetActiveScene(previous); }
        }

        private static void EnsureStandardMaterial()
        {
            var material = AssetDatabase.LoadAssetAtPath<Material>(StandardMaterialPath);
            if (!material)
            {
                if (File.Exists(StandardMaterialPath))
                    throw new InvalidOperationException("Cannot load the existing runtime material: " + StandardMaterialPath);
                var shader = Shader.Find("Standard");
                if (!shader) throw new InvalidOperationException("The built-in Standard shader is unavailable.");
                if (!AssetDatabase.IsValidFolder("Assets/CRWT/Resources"))
                    AssetDatabase.CreateFolder("Assets/CRWT", "Resources");
                if (!AssetDatabase.IsValidFolder("Assets/CRWT/Resources/Materials"))
                    AssetDatabase.CreateFolder("Assets/CRWT/Resources", "Materials");
                material = new Material(shader) { name = "CRWT_Standard", enableInstancing = true };
                AssetDatabase.CreateAsset(material, StandardMaterialPath);
                AssetDatabase.SaveAssetIfDirty(material);
            }
            // Existing assets are validated, never silently rewritten. Runtime
            // palette clones change scalar values only, not shader keywords.
            if (!material.shader || material.shader.name != "Standard" || !material.enableInstancing
                || material.shaderKeywords.Length != 0 || material.GetFloat("_Mode") != 0
                || material.GetFloat("_SrcBlend") != 1 || material.GetFloat("_DstBlend") != 0
                || material.GetFloat("_ZWrite") != 1 || material.GetFloat("_Metallic") != 0
                || material.renderQueue != (int)UnityEngine.Rendering.RenderQueue.Geometry
                || material.GetTag("RenderType", false) != "Opaque")
                throw new InvalidOperationException(StandardMaterialPath
                    + " must use opaque Standard defaults, no feature keywords, and Enable GPU Instancing.");
        }

        private static void EnsureRuntimeShaders()
        {
            // These scenes contain controllers only. Runtime-created Image,
            // RawImage, Text and Starwheel graphics all use this Canvas shader,
            // which build-time scene dependency collection cannot discover.
            var runtimeShaders = RuntimeShaders.Select(Shader.Find).ToList();
            runtimeShaders.Add(UnityEngine.UI.Graphic.defaultGraphicMaterial.shader);
            if (runtimeShaders.Any(shader => !shader))
                throw new InvalidOperationException("Resolve the built-in UI shader and com.unity.cloud.gltfast before setup.");
            var settings = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/GraphicsSettings.asset");
            if (settings.Length == 0) throw new InvalidOperationException("GraphicsSettings is not available.");
            var serialized = new SerializedObject(settings[0]);
            var shaders = serialized.FindProperty("m_AlwaysIncludedShaders");
            if (shaders == null || !shaders.isArray)
                throw new InvalidOperationException("Cannot configure runtime UI/glTF shader inclusion.");
            bool changed = false;
            // Standard is now retained by its real Resources material. Remove
            // the previous setup's blanket inclusion and its unused variants.
            for (int i = shaders.arraySize - 1; i >= 0; i--)
            {
                var included = shaders.GetArrayElementAtIndex(i).objectReferenceValue as Shader;
                if (!included || included.name != "Standard") continue;
                shaders.GetArrayElementAtIndex(i).objectReferenceValue = null;
                shaders.DeleteArrayElementAtIndex(i);
                changed = true;
            }
            foreach (var shader in runtimeShaders.Distinct())
            {
                bool found = false;
                for (int i = 0; i < shaders.arraySize; i++)
                    if (shaders.GetArrayElementAtIndex(i).objectReferenceValue == shader) { found = true; break; }
                if (found) continue;
                int index = shaders.arraySize;
                shaders.InsertArrayElementAtIndex(index);
                shaders.GetArrayElementAtIndex(index).objectReferenceValue = shader;
                changed = true;
            }
            if (changed)
            {
                serialized.ApplyModifiedPropertiesWithoutUndo();
                AssetDatabase.SaveAssetIfDirty(settings[0]);
            }
        }

        private static void EnsureUiInputBindings()
        {
            // StandaloneInputModule uses these four named bindings even when the
            // board itself reads pointer/touch input directly. Preserve custom bindings.
            var assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/InputManager.asset");
            if (assets.Length == 0)
                throw new InvalidOperationException("Input Manager is unavailable. Open Project Settings > Input Manager, then run Setup Project again.");
            var serialized = new SerializedObject(assets[0]);
            var axes = serialized.FindProperty("m_Axes");
            if (axes == null || !axes.isArray) throw new InvalidOperationException("Input Manager has no axes list.");
            bool changed = AddMissingUiAxis(axes,"Horizontal","left","right","a","d",3,true);
            changed |= AddMissingUiAxis(axes,"Vertical","down","up","s","w",3,true);
            changed |= AddMissingUiAxis(axes,"Submit","","return","","space",1000,false);
            changed |= AddMissingUiAxis(axes,"Cancel","","escape","","",1000,false);
            if (changed)
            {
                serialized.ApplyModifiedPropertiesWithoutUndo();
                AssetDatabase.SaveAssetIfDirty(assets[0]);
            }
        }

        private static bool AddMissingUiAxis(SerializedProperty axes, string name, string negative,
            string positive, string altNegative, string altPositive, float speed, bool snap)
        {
            for (int i = 0; i < axes.arraySize; i++)
                if (axes.GetArrayElementAtIndex(i).FindPropertyRelative("m_Name").stringValue == name) return false;
            int index = axes.arraySize;
            axes.InsertArrayElementAtIndex(index);
            var axis = axes.GetArrayElementAtIndex(index);
            axis.FindPropertyRelative("m_Name").stringValue = name;
            axis.FindPropertyRelative("descriptiveName").stringValue = "";
            axis.FindPropertyRelative("descriptiveNegativeName").stringValue = "";
            axis.FindPropertyRelative("negativeButton").stringValue = negative;
            axis.FindPropertyRelative("positiveButton").stringValue = positive;
            axis.FindPropertyRelative("altNegativeButton").stringValue = altNegative;
            axis.FindPropertyRelative("altPositiveButton").stringValue = altPositive;
            axis.FindPropertyRelative("gravity").floatValue = speed;
            axis.FindPropertyRelative("dead").floatValue = .001f;
            axis.FindPropertyRelative("sensitivity").floatValue = speed;
            axis.FindPropertyRelative("snap").boolValue = snap;
            axis.FindPropertyRelative("invert").boolValue = false;
            axis.FindPropertyRelative("type").intValue = 0;
            axis.FindPropertyRelative("axis").intValue = 0;
            axis.FindPropertyRelative("joyNum").intValue = 0;
            return true;
        }

        private static void EnsureArtTextureImports()
        {
            const string folder = "Assets/Resources/CRWT/Art";
            if (!Directory.Exists(folder)) return;
            foreach (var path in Directory.GetFiles(folder,"*.png",SearchOption.AllDirectories))
            {
                var importer = AssetImporter.GetAtPath(path.Replace('\\','/')) as TextureImporter;
                if (importer != null && CrwtArtTextureImporter.Configure(importer)) importer.SaveAndReimport();
            }
        }
    }

    // Configure during first import without queuing another import. The setup menu
    // repairs older metadata only when it differs; neither path calls Refresh.
    internal sealed class CrwtArtTextureImporter : AssetPostprocessor
    {
        private void OnPreprocessTexture()
        {
            if (assetPath.StartsWith("Assets/Resources/CRWT/Art/",StringComparison.Ordinal)
                && assetPath.EndsWith(".png",StringComparison.OrdinalIgnoreCase))
                Configure((TextureImporter)assetImporter);
        }

        internal static bool Configure(TextureImporter importer)
        {
            bool changed = importer.textureType != TextureImporterType.Default
                || importer.textureShape != TextureImporterShape.Texture2D || importer.mipmapEnabled
                || importer.maxTextureSize != 2048 || importer.isReadable
                || importer.wrapMode != TextureWrapMode.Clamp || importer.filterMode != FilterMode.Bilinear
                || importer.npotScale != TextureImporterNPOTScale.None || !importer.sRGBTexture
                || !importer.alphaIsTransparency;
            if (!changed) return false;
            importer.textureType = TextureImporterType.Default;
            importer.textureShape = TextureImporterShape.Texture2D;
            importer.mipmapEnabled = false;
            importer.maxTextureSize = 2048;
            importer.isReadable = false;
            importer.wrapMode = TextureWrapMode.Clamp;
            importer.filterMode = FilterMode.Bilinear;
            importer.npotScale = TextureImporterNPOTScale.None;
            importer.sRGBTexture = true;
            importer.alphaIsTransparency = true;
            return true;
        }
    }
}
#endif
