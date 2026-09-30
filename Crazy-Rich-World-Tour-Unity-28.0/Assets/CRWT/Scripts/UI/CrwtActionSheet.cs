using UnityEngine;
using UnityEngine.UI;

namespace ComePlayers.CrazyRich
{
    // A temporary scrollable sheet; no large permanent board overlays.
    public sealed class CrwtActionSheet : MonoBehaviour
    {
        private GameObject overlay;
        public RectTransform Content { get; private set; }
        public bool IsOpen => overlay && overlay.activeSelf;
        public string Context { get; private set; }
        private Transform canvas;
        public void Initialize(Transform parent) { canvas = parent; }
        public void Show(string title, string context)
        {
            Close(); Context = context;
            var shade = CrwtUi.Panel(canvas, "Choice overlay", new Color(0,0,0,.68f), Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            overlay = shade.gameObject;
            var panel = CrwtUi.Panel(shade, "Choice sheet", Color.Lerp(CrwtUi.Card, CrwtUi.Lavender, .10f), new Vector2(.18f,.15f), new Vector2(.82f,.86f), Vector2.zero, Vector2.zero);
            CrwtUi.Panel(panel, "Anime title ribbon", Color.Lerp(CrwtUi.Lavender, CrwtUi.Card, .38f),
                new Vector2(.025f,.845f), new Vector2(.975f,.985f), Vector2.zero, Vector2.zero).GetComponent<Image>().raycastTarget = false;
            var heading = CrwtUi.Text(panel, title, 28, TextAnchor.MiddleLeft, CrwtUi.Gold);
            heading.rectTransform.anchorMin = new Vector2(.05f,.86f); heading.rectTransform.anchorMax = new Vector2(.80f,.99f);
            heading.rectTransform.offsetMin = heading.rectTransform.offsetMax = Vector2.zero;
            var close = CrwtUi.Button(panel, "TUTUP", Close, CrwtUi.Rose, 54);
            var cr = (RectTransform)close.transform; cr.anchorMin = new Vector2(.82f,.89f); cr.anchorMax = new Vector2(.97f,.98f); cr.offsetMin = cr.offsetMax = Vector2.zero;
            var view = CrwtUi.Panel(panel, "Viewport", new Color(.08f,.10f,.20f,.74f), new Vector2(.03f,.04f), new Vector2(.97f,.83f), Vector2.zero, Vector2.zero);
            view.gameObject.AddComponent<RectMask2D>();
            Content = CrwtUi.Panel(view, "Options", Color.clear, new Vector2(0,1), Vector2.one, Vector2.zero, Vector2.zero);
            Content.pivot = new Vector2(.5f,1);
            CrwtUi.Vertical(Content, 10, new RectOffset(14,14,8,8));
            var fit = Content.gameObject.AddComponent<ContentSizeFitter>(); fit.verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            var scroll = view.gameObject.AddComponent<ScrollRect>(); scroll.viewport = view; scroll.content = Content;
            scroll.horizontal = false; scroll.vertical = true; scroll.movementType = ScrollRect.MovementType.Clamped;
            scroll.scrollSensitivity = 30;
        }
        public Text Note(string text)
        {
            var card = CrwtUi.Panel(Content, "Anime note", new Color(.13f,.16f,.29f,.94f),
                Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            card.gameObject.AddComponent<LayoutElement>().preferredHeight = 78;
            var label = CrwtUi.Text(card, text, 22, TextAnchor.MiddleLeft, Color.white);
            CrwtUi.Fill(label.rectTransform, 16);
            label.resizeTextForBestFit = true; label.resizeTextMinSize = 16; label.resizeTextMaxSize = 22;
            return label;
        }
        public void Close()
        {
            if (overlay) { overlay.SetActive(false); Destroy(overlay); }
            overlay = null; Content = null; Context = null;
        }
    }
}
