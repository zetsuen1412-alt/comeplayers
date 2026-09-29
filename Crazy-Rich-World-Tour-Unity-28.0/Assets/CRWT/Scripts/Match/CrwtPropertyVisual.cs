using UnityEngine;

namespace ComePlayers.CrazyRich
{
    internal static class CrwtPropertyVisual
    {
        internal static void Build(CrwtBoardArt art, Transform parent, int level, Color owner)
        {
            // Existing backend levels: 0 land, 1 House, 2 Tower, 3 Hotel, 4 Landmark.
            // Each silhouette uses a small fixed number of shared-mesh primitives.
            art.Shape(parent, "Plot", PrimitiveType.Cube, new Vector3(0, .025f, 0), new Vector3(.65f, .05f, .5f), art.Cream);
            switch (Mathf.Clamp(level, 0, 4))
            {
                case 0:
                    art.Shape(parent, "Owned Plot Sign", PrimitiveType.Cube, new Vector3(0, .17f, 0), new Vector3(.35f, .26f, .06f), owner);
                    break;
                case 1:
                    art.Shape(parent, "House", PrimitiveType.Cube, new Vector3(0, .22f, 0), new Vector3(.5f, .4f, .4f), art.Cream);
                    art.Roof(parent, new Vector3(0, .42f, 0), new Vector3(.62f, .27f, .52f), owner);
                    art.Shape(parent, "House Door", PrimitiveType.Cube, new Vector3(0, .15f, -.205f), new Vector3(.12f, .22f, .02f), art.Ink);
                    break;
                case 2:
                    art.Shape(parent, "Tower", PrimitiveType.Cube, new Vector3(0, .48f, 0), new Vector3(.36f, .94f, .34f), owner);
                    art.Shape(parent, "Tower Glass", PrimitiveType.Cube, new Vector3(0, .52f, -.18f), new Vector3(.19f, .67f, .02f), art.Ink);
                    art.Shape(parent, "Tower Crown", PrimitiveType.Cube, new Vector3(0, .98f, 0), new Vector3(.44f, .08f, .42f), art.Gold);
                    break;
                case 3:
                    art.Shape(parent, "Hotel Wing Left", PrimitiveType.Cube, new Vector3(-.23f, .34f, 0), new Vector3(.2f, .66f, .43f), owner);
                    art.Shape(parent, "Hotel Wing Right", PrimitiveType.Cube, new Vector3(.23f, .34f, 0), new Vector3(.2f, .66f, .43f), owner);
                    art.Shape(parent, "Hotel Lobby", PrimitiveType.Cube, new Vector3(0, .44f, 0), new Vector3(.24f, .85f, .38f), art.Cream);
                    art.Shape(parent, "Hotel Roof", PrimitiveType.Cube, new Vector3(0, .89f, 0), new Vector3(.28f, .08f, .42f), art.Gold);
                    art.Shape(parent, "Hotel Entrance", PrimitiveType.Cube, new Vector3(0, .16f, -.2f), new Vector3(.16f, .25f, .03f), art.Ink);
                    break;
                default:
                    art.Shape(parent, "Landmark Lower", PrimitiveType.Cylinder, new Vector3(0, .16f, 0), new Vector3(.58f, .15f, .58f), owner);
                    art.Shape(parent, "Landmark Spire", PrimitiveType.Cylinder, new Vector3(0, .59f, 0), new Vector3(.26f, .35f, .26f), art.Cream);
                    art.Shape(parent, "Landmark Crown", PrimitiveType.Sphere, new Vector3(0, .98f, 0), Vector3.one * .38f, art.Gold);
                    art.Roof(parent, new Vector3(0, 1.08f, 0), new Vector3(.22f, .25f, .22f), owner);
                    break;
            }
        }
    }
}
