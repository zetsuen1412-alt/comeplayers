using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace ComePlayers.CrazyRich
{
    // Small shared palette/mesh cache owned by a board. Never use Renderer.material:
    // it silently clones a material for each tile, window and property.
    internal sealed class CrwtBoardArt : System.IDisposable
    {
        private readonly Dictionary<Color32, Material> materials = new Dictionary<Color32, Material>();
        private readonly Shader shader;
        private Mesh ring, squareRing, roof;
        internal readonly Color Cream = new Color(.96f, .93f, .83f);
        internal readonly Color Gold = new Color(1f, .75f, .26f);
        internal readonly Color Ink = new Color(.08f, .13f, .23f);

        public CrwtBoardArt()
        {
            shader = GraphicsSettings.currentRenderPipeline != null
                ? Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard")
                : Shader.Find("Standard");
        }

        internal Material Material(Color color)
        {
            Color32 key = color;
            if (!materials.TryGetValue(key, out var value))
            {
                value = new Material(shader) { name = "CRWT Shared " + key, enableInstancing = true };
                value.color = color;
                if (value.HasProperty("_BaseColor")) value.SetColor("_BaseColor", color);
                if (value.HasProperty("_Smoothness")) value.SetFloat("_Smoothness", .3f);
                materials.Add(key, value);
            }
            return value;
        }

        internal GameObject Shape(Transform parent, string name, PrimitiveType type, Vector3 position, Vector3 scale, Color color)
        {
            var item = GameObject.CreatePrimitive(type);
            item.name = name;
            item.transform.SetParent(parent, false);
            item.transform.localPosition = position;
            item.transform.localScale = scale;
            var collider = item.GetComponent<Collider>();
            if (collider) { collider.enabled = false; Object.Destroy(collider); }
            SetRenderer(item.GetComponent<Renderer>(), color);
            return item;
        }

        private void SetRenderer(Renderer renderer, Color color)
        {
            renderer.sharedMaterial = Material(color);
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = false;
        }

        internal GameObject Ring(Transform parent, string name, Vector3 position, float scale, Color color, bool square = false)
        {
            if (square && !squareRing) squareRing = MakeRing(4, .94f, 1f, 45);
            if (!square && !ring) ring = MakeRing(32, .85f, 1f, 0);
            var result = new GameObject(name, typeof(MeshFilter), typeof(MeshRenderer));
            result.transform.SetParent(parent, false);
            result.transform.localPosition = position;
            result.transform.localScale = Vector3.one * scale;
            result.GetComponent<MeshFilter>().sharedMesh = square ? squareRing : ring;
            SetRenderer(result.GetComponent<Renderer>(), color);
            return result;
        }

        internal GameObject Roof(Transform parent, Vector3 position, Vector3 scale, Color color)
        {
            if (!roof)
            {
                // Separate triangle vertices keep the four roof planes crisp.
                var vertices = new List<Vector3>();
                var triangles = new List<int>();
                var corners = new[] { new Vector3(-.5f, 0, -.5f), new Vector3(.5f, 0, -.5f), new Vector3(.5f, 0, .5f), new Vector3(-.5f, 0, .5f) };
                for (int i = 0; i < 4; i++)
                {
                    vertices.Add(corners[i]); vertices.Add(new Vector3(0, 1, 0)); vertices.Add(corners[(i + 1) % 4]);
                    triangles.Add(i * 3); triangles.Add(i * 3 + 1); triangles.Add(i * 3 + 2);
                }
                roof = new Mesh { name = "CRWT Shared Pyramid Roof" };
                roof.SetVertices(vertices); roof.SetTriangles(triangles, 0); roof.RecalculateNormals(); roof.RecalculateBounds();
            }
            var item = new GameObject("Roof", typeof(MeshFilter), typeof(MeshRenderer));
            item.transform.SetParent(parent, false); item.transform.localPosition = position; item.transform.localScale = scale;
            item.GetComponent<MeshFilter>().sharedMesh = roof; SetRenderer(item.GetComponent<Renderer>(), color);
            return item;
        }

        internal TextMesh Label(Transform parent, string name, string text, Vector3 position, float size, Color color)
        {
            var item = new GameObject(name, typeof(TextMesh));
            item.transform.SetParent(parent, false); item.transform.localPosition = position;
            item.transform.localRotation = Quaternion.Euler(90, 0, 0);
            var label = item.GetComponent<TextMesh>();
            label.text = text; label.fontSize = 64; label.characterSize = size;
            label.anchor = TextAnchor.MiddleCenter; label.alignment = TextAlignment.Center;
            label.color = color; label.richText = false;
            var renderer = item.GetComponent<Renderer>();
            renderer.shadowCastingMode = ShadowCastingMode.Off; renderer.receiveShadows = false;
            return label;
        }

        private static Mesh MakeRing(int segments, float inner, float outer, float rotation)
        {
            var vertices = new Vector3[segments * 2];
            var triangles = new int[segments * 6];
            for (int i = 0; i < segments; i++)
            {
                var angle = (rotation + i * 360f / segments) * Mathf.Deg2Rad;
                var direction = new Vector3(Mathf.Cos(angle), 0, Mathf.Sin(angle));
                vertices[2 * i] = direction * outer; vertices[2 * i + 1] = direction * inner;
                var next = (i + 1) % segments;
                var t = i * 6;
                triangles[t] = 2 * i; triangles[t + 1] = 2 * i + 1; triangles[t + 2] = 2 * next;
                triangles[t + 3] = 2 * next; triangles[t + 4] = 2 * i + 1; triangles[t + 5] = 2 * next + 1;
            }
            var mesh = new Mesh { name = "CRWT Shared Ring " + segments, vertices = vertices, triangles = triangles };
            mesh.RecalculateNormals(); mesh.RecalculateBounds(); return mesh;
        }

        public void Dispose()
        {
            foreach (var material in materials.Values) if (material) Object.Destroy(material);
            materials.Clear();
            if (ring) Object.Destroy(ring);
            if (squareRing) Object.Destroy(squareRing);
            if (roof) Object.Destroy(roof);
        }
    }
}
