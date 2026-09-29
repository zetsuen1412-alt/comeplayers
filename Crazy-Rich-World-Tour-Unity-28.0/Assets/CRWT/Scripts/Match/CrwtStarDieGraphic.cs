using UnityEngine;
using UnityEngine.UI;

namespace ComePlayers.CrazyRich
{
    // Original seven-outcome Starwheel die: seven enamel petals around a face.
    // It is deliberately a fantasy wheel/token, never a six-sided cube.
    public sealed class CrwtStarDieGraphic : MaskableGraphic
    {
        public int Face { get; private set; } = -1;
        private float pulse;
        public void SetFace(int face) { Face = face; SetVerticesDirty(); }
        public void SetPulse(float value) { pulse = value; SetVerticesDirty(); }

        protected override void OnPopulateMesh(VertexHelper vh)
        {
            vh.Clear();
            float r = Mathf.Min(rectTransform.rect.width, rectTransform.rect.height) * .43f;
            var center = rectTransform.rect.center;
            if (Face == 0)
            {
                Ring(vh, center, r * (1.15f + pulse * .06f), r * 1.07f, 56, new Color(.45f, 1f, .95f, .28f + pulse * .30f));
                for (int i = 0; i < 7; i++)
                {
                    float angle = (90f + i * 360f / 7f) * Mathf.Deg2Rad;
                    var p = center + new Vector2(Mathf.Cos(angle), Mathf.Sin(angle)) * r * 1.15f;
                    Star(vh, p, r * .08f, new Color(1f, .96f, .62f));
                }
            }
            Disc(vh, center + new Vector2(0, -r * .07f), r * 1.04f, 7, new Color(.12f, .10f, .25f));
            Disc(vh, center, r, 7, new Color(1f, .80f, .36f));
            Disc(vh, center, r * .92f, 7, color);
            for (int i = 0; i < 7; i++)
            {
                float angle = (90f + i * 360f / 7f) * Mathf.Deg2Rad;
                var p = center + new Vector2(Mathf.Cos(angle), Mathf.Sin(angle)) * r * .72f;
                Disc(vh, p, r * (i == Face ? .13f : .09f), 7,
                    i == Face ? new Color(1f, .95f, .65f) : new Color(1, 1, 1, .45f));
            }
            Disc(vh, center, r * .56f, 56, new Color(.10f, .09f, .23f));
            Ring(vh, center, r * .56f, r * .52f, 56,
                Face == 0 ? new Color(.65f, 1f, .96f) : new Color(1, 1, 1, .75f));
        }

        private static void Disc(VertexHelper vh, Vector2 c, float r, int sides, Color col)
        {
            int start = vh.currentVertCount;
            vh.AddVert(c, col, Vector2.zero);
            for (int i = 0; i < sides; i++)
            {
                float a = (90 + i * 360f / sides) * Mathf.Deg2Rad;
                vh.AddVert(c + new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * r, col, Vector2.zero);
            }
            for (int i = 0; i < sides; i++) vh.AddTriangle(start, start + 1 + i, start + 1 + (i + 1) % sides);
        }

        private static void Ring(VertexHelper vh, Vector2 c, float outer, float inner, int sides, Color col)
        {
            int start = vh.currentVertCount;
            for (int i = 0; i < sides; i++)
            {
                float a = i * Mathf.PI * 2 / sides;
                var p = new Vector2(Mathf.Cos(a), Mathf.Sin(a));
                vh.AddVert(c + p * outer, col, Vector2.zero);
                vh.AddVert(c + p * inner, col, Vector2.zero);
            }
            for (int i = 0; i < sides; i++)
            {
                int a = start + i * 2, b = start + ((i + 1) % sides) * 2;
                vh.AddTriangle(a, b, a + 1); vh.AddTriangle(a + 1, b, b + 1);
            }
        }

        private static void Star(VertexHelper vh, Vector2 c, float r, Color col)
        {
            int start = vh.currentVertCount;
            vh.AddVert(c, col, Vector2.zero);
            for (int i = 0; i < 8; i++)
            {
                float a = i * Mathf.PI / 4;
                vh.AddVert(c + new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * r * (i % 2 == 0 ? 1 : .32f), col, Vector2.zero);
            }
            for (int i = 0; i < 8; i++) vh.AddTriangle(start, start + 1 + i, start + 1 + (i + 1) % 8);
        }
    }
}
