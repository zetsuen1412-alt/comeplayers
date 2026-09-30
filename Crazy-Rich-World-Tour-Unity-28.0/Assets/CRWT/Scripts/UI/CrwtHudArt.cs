using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace ComePlayers.CrazyRich
{
    public static class CrwtHudArt
    {
        private static readonly Dictionary<string, Texture2D> generatedAvatars = new Dictionary<string, Texture2D>();

        public static RawImage Portrait(Transform parent, string character)
        {
            var go = new GameObject("Portrait", typeof(RectTransform), typeof(RawImage));
            go.transform.SetParent(parent, false);
            var image = go.GetComponent<RawImage>(); image.raycastTarget = false;
            SetPortrait(image, character);
            return image;
        }

        public static void SetPortrait(RawImage image, string character)
        {
            if (!image) return;
            var id = CrwtCharacterView.NormalizeCharacterId(character);
            var atlas = Resources.Load<Texture2D>("CRWT/Art/portraits-alexia-rindi");
            if (atlas && (id == "alexia" || id == "rindi"))
            {
                image.texture = atlas;
                image.uvRect = new Rect(id == "rindi" ? .5f : 0, 0, .5f, 1);
                image.enabled = true;
                return;
            }
            image.texture = AvatarTexture(id);
            image.uvRect = new Rect(0, 0, 1, 1);
            image.enabled = image.texture;
        }

        public static string CharacterDisplayName(string character)
        {
            switch (CrwtCharacterView.NormalizeCharacterId(character))
            {
                case "rindi": return "RINDI";
                case "kairo": return "KAIRO";
                case "luna": return "LUNA";
                case "nox": return "NOX";
                case "atlas": return "ATLAS";
                default: return "ALEXIA";
            }
        }

        private static Texture2D AvatarTexture(string id)
        {
            if (generatedAvatars.TryGetValue(id, out var cached) && cached) return cached;
            const int size = 128;
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false)
            {
                name = "CRWT Runtime Avatar " + id,
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear,
                hideFlags = HideFlags.HideAndDontSave
            };

            var bg = Accent(id);
            var pixels = new Color32[size * size];
            var baseColor = Color.Lerp(bg, CrwtUi.Ink, .48f);
            var base32 = (Color32)baseColor;
            for (var i = 0; i < pixels.Length; i++) pixels[i] = base32;
            texture.SetPixels32(pixels);

            // Premium flat chibi icon: outfit, hair mass, face, fringe and layered anime eyes.
            DrawEllipse(texture, 64, 13, 43, 30, Color.Lerp(bg, Color.white, .10f));
            DrawEllipse(texture, 64, 80, 45, 44, Hair(id));
            DrawEllipse(texture, 64, 69, 36, 37, new Color(1f,.80f,.69f));
            DrawEllipse(texture, 64, 94, 38, 19, Hair(id));
            for (var x = 35; x <= 93; x += 14) DrawEllipse(texture, x, 84 + Mathf.Abs(x - 64) / 8, 12, 18, Hair(id));

            DrawAnimeEye(texture, 50, 69, Eye(id));
            DrawAnimeEye(texture, 78, 69, Eye(id));
            DrawEllipse(texture, 41, 58, 8, 3, new Color(1f,.48f,.60f,.74f));
            DrawEllipse(texture, 87, 58, 8, 3, new Color(1f,.48f,.60f,.74f));
            DrawEllipse(texture, 64, 53, 7, 2, new Color(.15f,.08f,.16f));

            if (id == "kairo")
            {
                DrawEllipse(texture, 64, 100, 38, 5, CrwtUi.Gold);
                DrawEllipse(texture, 27, 74, 6, 13, bg);
            }
            else if (id == "luna") DrawEllipse(texture, 35, 99, 7, 7, CrwtUi.Gold);
            else if (id == "nox") DrawEllipse(texture, 64, 52, 22, 6, bg);
            else if (id == "atlas")
            {
                DrawEllipse(texture, 64, 106, 45, 7, CrwtUi.Gold);
                DrawEllipse(texture, 64, 112, 29, 8, bg);
            }

            DrawEllipse(texture, 64, 18, 8, 8, CrwtUi.Gold);
            texture.Apply(false, true);
            generatedAvatars[id] = texture;
            return texture;
        }

        private static void DrawAnimeEye(Texture2D texture, int cx, int cy, Color iris)
        {
            DrawEllipse(texture, cx, cy, 8, 11, Color.white);
            DrawEllipse(texture, cx, cy - 1, 5, 8, iris);
            DrawEllipse(texture, cx, cy - 2, 2, 5, CrwtUi.Ink);
            DrawEllipse(texture, cx - 2, cy + 4, 2, 2, Color.white);
        }

        private static void DrawEllipse(Texture2D texture, int cx, int cy, int rx, int ry, Color color)
        {
            var minX = Mathf.Max(0, cx - rx); var maxX = Mathf.Min(texture.width - 1, cx + rx);
            var minY = Mathf.Max(0, cy - ry); var maxY = Mathf.Min(texture.height - 1, cy + ry);
            for (var y = minY; y <= maxY; y++)
            for (var x = minX; x <= maxX; x++)
            {
                var dx = (x - cx) / (float)rx;
                var dy = (y - cy) / (float)ry;
                if (dx * dx + dy * dy <= 1f) texture.SetPixel(x, y, color);
            }
        }

        private static Color Accent(string id)
        {
            switch (id)
            {
                case "rindi": return CrwtUi.Rose;
                case "kairo": return CrwtUi.Cyan;
                case "luna": return CrwtUi.Lavender;
                case "nox": return new Color(.52f,.34f,.78f);
                case "atlas": return CrwtUi.Mint;
                default: return new Color(.36f,.70f,.96f);
            }
        }

        private static Color Hair(string id)
        {
            switch (id)
            {
                case "rindi": return new Color(1f,.40f,.62f);
                case "kairo": return new Color(.14f,.19f,.32f);
                case "luna": return new Color(.68f,.62f,.92f);
                case "nox": return new Color(.10f,.08f,.17f);
                case "atlas": return new Color(.40f,.24f,.12f);
                default: return new Color(.90f,.94f,1f);
            }
        }

        private static Color Eye(string id)
        {
            switch (id)
            {
                case "rindi": return new Color(.14f,.78f,.76f);
                case "kairo": return new Color(.20f,.72f,1f);
                case "luna": return new Color(.70f,.52f,1f);
                case "nox": return new Color(.85f,.42f,1f);
                case "atlas": return new Color(.28f,.80f,.57f);
                default: return new Color(.20f,.82f,1f);
            }
        }

        public static void Backdrop(Transform parent)
        {
            var texture = Resources.Load<Texture2D>("CRWT/Art/world-tour-lobby");
            if (!texture) return;
            var go = new GameObject("World Tour illustration", typeof(RectTransform), typeof(RawImage));
            go.transform.SetParent(parent, false);
            var image = go.GetComponent<RawImage>(); image.texture = texture; image.raycastTarget = false;
            image.color = new Color(.96f,.98f,1f,1);
            CrwtUi.Fill((RectTransform)go.transform);
        }
    }
}
