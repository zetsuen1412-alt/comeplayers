using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace ComePlayers.CrazyRich
{
    public static class CrwtUi
    {
        public static readonly Color Bg = new Color(0.025f, 0.035f, 0.07f, 1f);
        public static readonly Color Card = new Color(0.06f, 0.08f, 0.14f, 0.96f);
        public static readonly Color Gold = new Color(1f, 0.76f, 0.18f, 1f);
        public static readonly Color Cyan = new Color(0.12f, 0.78f, 0.95f, 1f);
        public static readonly Color Danger = new Color(0.92f, 0.25f, 0.30f, 1f);

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
            go.GetComponent<Image>().color = color;
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
            return text;
        }

        public static Button Button(Transform parent, string label, Action clicked, Color? color = null, float height = 68f)
        {
            var go = new GameObject("Button_" + label, typeof(RectTransform), typeof(Image), typeof(Button), typeof(LayoutElement));
            go.transform.SetParent(parent, false);
            go.GetComponent<Image>().color = color ?? Gold;
            go.GetComponent<LayoutElement>().preferredHeight = height;
            var btn = go.GetComponent<Button>();
            if (clicked != null) btn.onClick.AddListener(() => clicked());
            var tx = Text(go.transform, label, 25, TextAnchor.MiddleCenter, Color.black);
            Fill(tx.rectTransform, 8);
            return btn;
        }

        public static InputField Input(Transform parent, string placeholder, bool password = false)
        {
            var go = new GameObject("Input_" + placeholder, typeof(RectTransform), typeof(Image), typeof(InputField), typeof(LayoutElement));
            go.transform.SetParent(parent, false);
            go.GetComponent<Image>().color = new Color(0.12f, 0.14f, 0.20f, 1f);
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
            for (var i = t.childCount - 1; i >= 0; i--) UnityEngine.Object.Destroy(t.GetChild(i).gameObject);
        }
    }
}
