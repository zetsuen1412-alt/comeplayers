using UnityEngine;
using UnityEngine.UI;

namespace ComePlayers.CrazyRich
{
    public static class CrwtHudArt
    {
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
            var atlas = Resources.Load<Texture2D>("CRWT/Art/portraits-alexia-rindi");
            image.texture = atlas;
            // Other characters retain their name/color instead of borrowing an identity.
            image.enabled = atlas && (character == "alexia" || character == "rindi");
            image.uvRect = new Rect(character == "rindi" ? .5f : 0, 0, .5f, 1);
        }
        public static void Backdrop(Transform parent)
        {
            var texture = Resources.Load<Texture2D>("CRWT/Art/world-tour-lobby");
            if (!texture) return;
            var go = new GameObject("World Tour illustration", typeof(RectTransform), typeof(RawImage));
            go.transform.SetParent(parent, false);
            var image = go.GetComponent<RawImage>(); image.texture = texture; image.raycastTarget = false;
            image.color = new Color(.75f,.79f,.90f,1);
            CrwtUi.Fill((RectTransform)go.transform);
        }
    }
}
