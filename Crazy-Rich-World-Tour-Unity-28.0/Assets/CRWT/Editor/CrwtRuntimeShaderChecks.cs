#if UNITY_EDITOR
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.UI;

namespace ComePlayers.CrazyRich.Editor
{
    // Runs for normal Build Profiles builds as well as the batch/menu build.
    // Editor shader availability alone cannot prove inclusion in a player.
    internal sealed class CrwtRuntimeShaderChecks : IPreprocessBuildWithReport
    {
        public int callbackOrder => 0;
        public void OnPreprocessBuild(BuildReport report) => Run();

        internal static void Run()
        {
            var settings = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/GraphicsSettings.asset");
            if (settings.Length == 0) throw new BuildFailedException("GraphicsSettings is unavailable.");
            var serialized = new SerializedObject(settings[0]);
            var included = serialized.FindProperty("m_AlwaysIncludedShaders");
            if (included == null || !included.isArray)
                throw new BuildFailedException("Cannot verify player shader inclusion.");
            var retained = Enumerable.Range(0, included.arraySize)
                .Select(i => included.GetArrayElementAtIndex(i).objectReferenceValue as Shader).ToArray();
            var ui = Graphic.defaultGraphicMaterial;
            foreach (var shader in new[] { ui ? ui.shader : null, Shader.Find("glTF/PbrMetallicRoughness") })
            {
                if (!shader || shader.name == "Hidden/InternalErrorShader" || !retained.Contains(shader))
                    throw new BuildFailedException("A runtime UI/character shader would be stripped from the player: "
                        + (shader ? shader.name : "missing") + ". Run Crazy Rich > 30.0 > Setup Project before building.");
                Debug.Log("[CRWT 30] Player shader retained: " + shader.name);
            }
        }
    }
}
#endif
