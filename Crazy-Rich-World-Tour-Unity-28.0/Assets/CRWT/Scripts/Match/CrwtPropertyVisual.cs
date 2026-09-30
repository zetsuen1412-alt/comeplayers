using UnityEngine;

namespace ComePlayers.CrazyRich
{
    internal static class CrwtPropertyVisual
    {
        internal static void Build(CrwtBoardArt art, Transform parent, int level, Color owner)
        {
            // Presentation only: backend levels remain 0 land, 1 House, 2 Tower, 3 Hotel, 4 Landmark.
            // Rounded primitives make every upgrade readable like a miniature anime toy.
            art.Shape(parent, "Garden Plot", PrimitiveType.Cube, new Vector3(0, .025f, 0), new Vector3(.68f, .05f, .52f), art.Mint);
            switch (Mathf.Clamp(level, 0, 4))
            {
                case 0:
                    art.Shape(parent, "Plot Sign Post", PrimitiveType.Cylinder, new Vector3(0, .14f, 0), new Vector3(.055f, .13f, .055f), art.Gold);
                    art.Shape(parent, "Owned Plot Sign", PrimitiveType.Sphere, new Vector3(0, .30f, 0), new Vector3(.24f, .16f, .07f), owner);
                    break;
                case 1:
                    art.Shape(parent, "Chibi House", PrimitiveType.Sphere, new Vector3(0, .25f, 0), new Vector3(.52f, .40f, .43f), art.Cream);
                    art.Roof(parent, new Vector3(0, .48f, 0), new Vector3(.64f, .30f, .54f), owner);
                    art.Shape(parent, "House Door", PrimitiveType.Sphere, new Vector3(0, .17f, -.215f), new Vector3(.12f, .20f, .035f), owner);
                    art.Shape(parent, "House Window L", PrimitiveType.Sphere, new Vector3(-.16f, .29f, -.218f), new Vector3(.10f, .09f, .025f), art.Sky);
                    art.Shape(parent, "House Window R", PrimitiveType.Sphere, new Vector3(.16f, .29f, -.218f), new Vector3(.10f, .09f, .025f), art.Sky);
                    break;
                case 2:
                    art.Shape(parent, "Bubble Tower", PrimitiveType.Capsule, new Vector3(0, .48f, 0), new Vector3(.30f, .52f, .30f), owner);
                    for (var row = 0; row < 3; row++)
                        art.Shape(parent, "Tower Window", PrimitiveType.Sphere, new Vector3(0, .32f + row * .25f, -.285f), new Vector3(.13f, .075f, .025f), art.Sky);
                    art.Shape(parent, "Tower Crown", PrimitiveType.Sphere, new Vector3(0, 1.04f, 0), new Vector3(.38f, .15f, .38f), art.Gold);
                    break;
                case 3:
                    art.Shape(parent, "Hotel Center", PrimitiveType.Capsule, new Vector3(0, .49f, 0), new Vector3(.26f, .50f, .28f), art.Cream);
                    art.Shape(parent, "Hotel Wing Left", PrimitiveType.Sphere, new Vector3(-.28f, .34f, 0), new Vector3(.25f, .34f, .32f), owner);
                    art.Shape(parent, "Hotel Wing Right", PrimitiveType.Sphere, new Vector3(.28f, .34f, 0), new Vector3(.25f, .34f, .32f), owner);
                    art.Shape(parent, "Hotel Awning", PrimitiveType.Sphere, new Vector3(0, .30f, -.30f), new Vector3(.28f, .10f, .08f), art.Gold);
                    art.Shape(parent, "Hotel Entrance", PrimitiveType.Sphere, new Vector3(0, .16f, -.29f), new Vector3(.12f, .20f, .035f), owner);
                    art.Shape(parent, "Hotel Crown", PrimitiveType.Sphere, new Vector3(0, 1.02f, 0), new Vector3(.30f, .14f, .30f), art.Gold);
                    break;
                default:
                    art.Shape(parent, "Landmark Base", PrimitiveType.Cylinder, new Vector3(0, .14f, 0), new Vector3(.62f, .14f, .62f), owner);
                    art.Shape(parent, "Landmark Body", PrimitiveType.Capsule, new Vector3(0, .61f, 0), new Vector3(.28f, .48f, .28f), art.Cream);
                    art.Shape(parent, "Landmark Halo", PrimitiveType.Sphere, new Vector3(0, 1.10f, 0), new Vector3(.42f, .16f, .42f), art.Gold);
                    art.Roof(parent, new Vector3(0, 1.26f, 0), new Vector3(.30f, .34f, .30f), owner);
                    art.Shape(parent, "Landmark Star", PrimitiveType.Sphere, new Vector3(0, 1.52f, 0), Vector3.one * .14f, art.Gold);
                    break;
            }
        }
    }
}
