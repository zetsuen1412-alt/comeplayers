using UnityEngine;

namespace ComePlayers.CrazyRich
{
    // Canvas-space safe area, refreshed after rotation or window resizing.
    public sealed class CrwtSafeArea : MonoBehaviour
    {
        private RectTransform rect;
        private Rect applied;
        private Vector2 screen;
        private void Awake() { rect = (RectTransform)transform; Apply(); }
        private void Update() { if (applied != Screen.safeArea || screen.x != Screen.width || screen.y != Screen.height) Apply(); }
        private void Apply()
        {
            if (!rect || Screen.width <= 0 || Screen.height <= 0) return;
            applied = Screen.safeArea; screen = new Vector2(Screen.width, Screen.height);
            rect.anchorMin = new Vector2(applied.xMin / screen.x, applied.yMin / screen.y);
            rect.anchorMax = new Vector2(applied.xMax / screen.x, applied.yMax / screen.y);
            rect.offsetMin = rect.offsetMax = Vector2.zero;
        }
    }
}
