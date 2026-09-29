using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace ComePlayers.CrazyRich
{
    public static class CrwtUi
    {
        public static readonly Color Bg = new Color(.045f, .065f, .13f, 1f);
        public static readonly Color Card = new Color(.105f, .12f, .24f, .97f);
        public static readonly Color Gold = new Color(1f, .78f, .25f, 1f);
        public static readonly Color Cyan = new Color(.24f, .82f, .96f, 1f);
        public static readonly Color Danger = new Color(.97f, .36f, .43f, 1f);
        public static readonly Color Rose = new Color(1f, .48f, .67f, 1f);
        public static readonly Color Mint = new Color(.38f, .90f, .70f, 1f);
        public static readonly Color Lavender = new Color(.67f, .55f, 1f, 1f);
        public static readonly Color Ink = new Color(.065f, .08f, .16f, 1f);
        private static Sprite roundedSprite;

        private static Sprite RoundedSprite
        {
            get
            {
                if (roundedSprite) return roundedSprite;
                const int size = 48, radius = 13;
                var texture = new Texture2D(size, size, TextureFormat.RGBA32, false)
                {
                    name = "CRWT Anime Rounded UI",
                    wrapMode = TextureWrapMode.Clamp,
                    filterMode = FilterMode.Bilinear,
                    hideFlags = HideFlags.HideAndDontSave
                };
                var pixels = new Color32[size * size];
                for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    var cx = Mathf.Clamp(x, radius, size - 1 - radius);
                    var cy = Mathf.Clamp(y, radius, size - 1 - radius);
                    var inside = (x - cx) * (x - cx) + (y - cy) * (y - cy) <= radius * radius;
                    pixels[y * size + x] = new Color32(255, 255, 255, inside ? (byte)255 : (byte)0);
                }
                texture.SetPixels32(pixels); texture.Apply(false, true);
                roundedSprite = Sprite.Create(texture, new Rect(0, 0, size, size), new Vector2(.5f, .5f), 100f, 0,
                    SpriteMeshType.FullRect, new Vector4(14, 14, 14, 14));
                roundedSprite.name = "CRWT Anime Rounded UI";
                roundedSprite.hideFlags = HideFlags.HideAndDontSave;
                return roundedSprite;
            }
        }

        public static Color TextColor(Color background)
        {
            var luma = background.r * .299f + background.g * .587f + background.b * .114f;
            return luma > .58f ? Ink : Color.white;
        }

        public static void StyleImage(Image image, Color color, bool outline = true)
        {
            if (!image) return;
            image.sprite = RoundedSprite;
            image.type = Image.Type.Sliced;
            image.color = color;
            if (!outline || color.a <= .01f) return;
            var edge = image.GetComponent<Outline>() ?? image.gameObject.AddComponent<Outline>();
            edge.effectColor = new Color(1f, 1f, 1f, .18f);
            edge.effectDistance = new Vector2(1.5f, -1.5f);
            edge.useGraphicAlpha = true;
        }

        public static Canvas CreateCanvas(string name = "UI")
        {
            if (UnityEngine.Object.FindFirstObjectByType<EventSystem>() == null)
            {
                var es = new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
                UnityEngine.Object.DontDestroyOnLoad(es);
            }
            var go = new GameObject(name, typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            var canvas = go.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = go.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            scaler.matchWidthOrHeight = 0.5f;
            return canvas;
        }

        public static RectTransform Panel(Transform parent, string name, Color color, Vector2 anchorMin, Vector2 anchorMax, Vector2 offsetMin, Vector2 offsetMax)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            go.transform.SetParent(parent, false);
            var rt = go.GetComponent<RectTransform>();
            rt.anchorMin = anchorMin; rt.anchorMax = anchorMax; rt.offsetMin = offsetMin; rt.offsetMax = offsetMax;
            var image = go.GetComponent<Image>();
            if (name == "Background" || name == "Safe area") image.color = color;
            else StyleImage(image, color);
            return rt;
        }

        public static Text Text(Transform parent, string value, int size = 28, TextAnchor alignment = TextAnchor.MiddleLeft, Color? color = null)
        {
            var go = new GameObject("Text", typeof(RectTransform), typeof(Text));
            go.transform.SetParent(parent, false);
            var text = go.GetComponent<Text>();
            text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            text.text = value;
            text.fontSize = size;
            text.alignment = alignment;
            text.color = color ?? Color.white;
            text.horizontalOverflow = HorizontalWrapMode.Wrap;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            text.supportRichText = false;
            text.raycastTarget = false;
            return text;
        }

        public static Button Button(Transform parent, string label, Action clicked, Color? color = null, float height = 68f)
        {
            var go = new GameObject("Button_" + label, typeof(RectTransform), typeof(Image), typeof(Button), typeof(LayoutElement));
            go.transform.SetParent(parent, false);
            var buttonColor = color ?? Gold;
            StyleImage(go.GetComponent<Image>(), buttonColor);
            go.GetComponent<LayoutElement>().preferredHeight = height;
            go.GetComponent<LayoutElement>().flexibleWidth = 1;
            var btn = go.GetComponent<Button>();
            if (clicked != null) btn.onClick.AddListener(() => clicked());
            var tx = Text(go.transform, label, 25, TextAnchor.MiddleCenter, TextColor(buttonColor));
            Fill(tx.rectTransform, 8);
            return btn;
        }

        public static InputField Input(Transform parent, string placeholder, bool password = false)
        {
            var go = new GameObject("Input_" + placeholder, typeof(RectTransform), typeof(Image), typeof(InputField), typeof(LayoutElement));
            go.transform.SetParent(parent, false);
            StyleImage(go.GetComponent<Image>(), new Color(.12f, .15f, .29f, 1f));
            go.GetComponent<LayoutElement>().preferredHeight = 64f;
            var field = go.GetComponent<InputField>();
            var tx = Text(go.transform, "", 23, TextAnchor.MiddleLeft, Color.white);
            Fill(tx.rectTransform, 16);
            var ph = Text(go.transform, placeholder, 23, TextAnchor.MiddleLeft, new Color(1, 1, 1, .45f));
            Fill(ph.rectTransform, 16);
            field.textComponent = tx;
            field.placeholder = ph;
            if (password) field.contentType = InputField.ContentType.Password;
            return field;
        }

        public static VerticalLayoutGroup Vertical(RectTransform parent, float spacing = 14f, RectOffset padding = null)
        {
            var v = parent.gameObject.AddComponent<VerticalLayoutGroup>();
            v.spacing = spacing;
            v.padding = padding ?? new RectOffset(26, 26, 26, 26);
            v.childControlHeight = true;
            v.childControlWidth = true;
            v.childForceExpandHeight = false;
            v.childForceExpandWidth = true;
            return v;
        }

        public static HorizontalLayoutGroup Horizontal(RectTransform parent, float spacing = 12f)
        {
            var h = parent.gameObject.AddComponent<HorizontalLayoutGroup>();
            h.spacing = spacing;
            h.padding = new RectOffset(8, 8, 8, 8);
            h.childControlHeight = true;
            h.childControlWidth = true;
            h.childForceExpandHeight = false;
            h.childForceExpandWidth = true;
            return h;
        }

        public static void Fill(RectTransform rt, float pad = 0)
        {
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
            rt.offsetMin = new Vector2(pad, pad); rt.offsetMax = new Vector2(-pad, -pad);
        }

        public static void Clear(Transform t)
        {
            for (var i = t.childCount - 1; i >= 0; i--)
            {
                var child = t.GetChild(i).gameObject;
                child.SetActive(false);
                UnityEngine.Object.Destroy(child);
            }
        }

        public static RectTransform SafeRoot(Transform canvas)
        {
            var rt = Panel(canvas, "Safe area", Color.clear, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            rt.GetComponent<Image>().raycastTarget = false;
            rt.gameObject.AddComponent<CrwtSafeArea>();
            return rt;
        }
    }
}
