using System.Collections.Generic;
using UnityEngine;

namespace ComePlayers.CrazyRich
{
    // Original lightweight chibi silhouettes remain usable while GLBs load or fail.
    // Every part is decorative and has no collider or gameplay authority.
    public sealed class CrwtChibiFallback : MonoBehaviour
    {
        private readonly List<Material> materials = new List<Material>();
        private Transform head;
        private Transform leftArm;
        private Transform rightArm;
        private Transform leftLeg;
        private Transform rightLeg;
        private Transform leftEye;
        private Transform rightEye;
        private bool zeroExpression;

        public void Build(string characterId)
        {
            var id = CrwtCharacterView.NormalizeCharacterId(characterId);
            var skin = MakeMaterial(new Color(1f, .79f, .65f));
            var ink = MakeMaterial(new Color(.075f, .06f, .12f));
            var white = MakeMaterial(new Color(1f, .98f, .94f));
            var gold = MakeMaterial(new Color(1f, .72f, .24f));
            var rose = MakeMaterial(new Color(1f, .47f, .62f));
            var hair = MakeMaterial(HairColor(id));
            var outfit = MakeMaterial(OutfitColor(id));
            var iris = MakeMaterial(EyeColor(id));

            Part("Coat", transform, new Vector3(0, .49f, 0), new Vector3(.34f, .40f, .25f), outfit);
            Part("Collar", transform, new Vector3(0, .65f, .045f), new Vector3(.29f, .075f, .25f), white);
            Part("GoldPin", transform, new Vector3(0, .58f, .137f), Vector3.one * .055f, gold);
            leftLeg = Joint("LeftLeg", transform, new Vector3(-.09f, .32f, 0));
            rightLeg = Joint("RightLeg", transform, new Vector3(.09f, .32f, 0));
            foreach (var leg in new[] { leftLeg, rightLeg })
            {
                Part("Stocking", leg, new Vector3(0, -.13f, 0), new Vector3(.105f, .27f, .105f), white);
                Part("Shoe", leg, new Vector3(0, -.255f, .035f), new Vector3(.13f, .10f, .19f), ink);
            }
            leftArm = Joint("LeftArm", transform, new Vector3(-.19f, .61f, 0));
            rightArm = Joint("RightArm", transform, new Vector3(.19f, .61f, 0));
            foreach (var arm in new[] { leftArm, rightArm })
            {
                Part("Sleeve", arm, new Vector3(0, -.09f, 0), new Vector3(.12f, .23f, .12f), outfit);
                Part("Hand", arm, new Vector3(0, -.21f, .015f), Vector3.one * .105f, skin);
            }
            head = Joint("Head", transform, new Vector3(0, .88f, 0));
            Part("HairBack", head, new Vector3(0, .015f, -.035f), new Vector3(.50f, .49f, .41f), hair);
            Part("Face", head, new Vector3(0, -.03f, .065f), new Vector3(.43f, .38f, .33f), skin);
            for (var i = -2; i <= 2; i++)
            {
                var bang = Part("Bangs", head, new Vector3(i * .075f, .105f - Mathf.Abs(i) * .012f, .177f), new Vector3(.145f, .18f, .10f), hair);
                bang.localRotation = Quaternion.Euler(0, 0, i * -13);
            }
            leftEye = Eye(head, "LeftEye", -.105f, white, iris, ink);
            rightEye = Eye(head, "RightEye", .105f, white, iris, ink);
            foreach (var x in new[] { -.105f, .105f })
                Part("Cheek", head, new Vector3(x * 1.42f, -.105f, .202f), new Vector3(.075f, .027f, .015f), rose);
            Part("Smile", head, new Vector3(0, -.123f, .225f), new Vector3(.05f, .018f, .015f), ink);

            switch (id)
            {
                case "alexia":
                    Part("BobLockLeft", head, new Vector3(-.27f, -.10f, -.055f), new Vector3(.15f, .30f, .17f), hair);
                    Part("BobLockRight", head, new Vector3(.27f, -.10f, -.055f), new Vector3(.15f, .30f, .17f), hair);
                    var ribbon = Part("NavyRibbon", head, new Vector3(-.19f, .20f, .02f), new Vector3(.16f, .085f, .075f), outfit);
                    ribbon.localRotation = Quaternion.Euler(0, 0, 24);
                    Part("GoldStarPin", head, new Vector3(-.10f, .22f, .12f), Vector3.one * .065f, gold);
                    break;
                case "rindi":
                    Part("LeftTwintail", head, new Vector3(-.27f, -.10f, -.075f), new Vector3(.18f, .38f, .20f), hair);
                    Part("RightTwintail", head, new Vector3(.27f, -.10f, -.075f), new Vector3(.18f, .38f, .20f), hair);
                    var bow = Part("RibbonLeft", head, new Vector3(.15f, .23f, .01f), new Vector3(.15f, .095f, .085f), rose);
                    bow.localRotation = Quaternion.Euler(0, 0, -25);
                    Part("RibbonRight", head, new Vector3(.28f, .23f, .01f), new Vector3(.15f, .095f, .085f), rose).localRotation = Quaternion.Euler(0, 0, 25);
                    break;
                case "kairo":
                    Part("Visor", head, new Vector3(0, .145f, .20f), new Vector3(.47f, .05f, .14f), gold);
                    Part("Headset", head, new Vector3(-.25f, -.01f, .03f), new Vector3(.075f, .13f, .10f), outfit);
                    break;
                case "luna":
                    Part("MoonPin", head, new Vector3(-.19f, .16f, .16f), Vector3.one * .095f, gold);
                    Part("MoonInset", head, new Vector3(-.16f, .18f, .18f), Vector3.one * .073f, hair);
                    Part("LongHair", head, new Vector3(0, -.23f, -.14f), new Vector3(.42f, .36f, .15f), hair);
                    break;
                case "nox":
                    Part("Mask", head, new Vector3(0, -.135f, .215f), new Vector3(.25f, .09f, .045f), outfit);
                    Part("SilverStreak", head, new Vector3(-.06f, .12f, .224f), new Vector3(.055f, .16f, .025f), white);
                    break;
                case "atlas":
                    Part("ExplorerHat", head, new Vector3(0, .18f, 0), new Vector3(.53f, .10f, .44f), gold);
                    Part("HatTop", head, new Vector3(0, .245f, -.015f), new Vector3(.34f, .12f, .28f), outfit);
                    Part("TravelBag", transform, new Vector3(0, .49f, -.16f), new Vector3(.25f, .25f, .16f), gold);
                    break;
            }
        }

        public void SetZeroExpression(bool value)
        {
            zeroExpression = value;
            if (leftEye) leftEye.localScale = new Vector3(1f, value ? .18f : 1f, 1f);
            if (rightEye) rightEye.localScale = new Vector3(1f, value ? .18f : 1f, 1f);
        }

        public void Animate(bool moving, bool reducedMotion, string reaction, float progress)
        {
            if (!head) return;
            var stride = moving && !reducedMotion ? Mathf.Sin(Time.unscaledTime * 13) * 24 : 0;
            leftLeg.localRotation = Quaternion.Euler(stride, 0, 0);
            rightLeg.localRotation = Quaternion.Euler(-stride, 0, 0);
            leftArm.localRotation = Quaternion.Euler(-stride, 0, -8);
            rightArm.localRotation = Quaternion.Euler(stride, 0, 8);
            head.localRotation = Quaternion.identity;
            if (reducedMotion || reaction == null) return;
            var wave = Mathf.Sin(progress * Mathf.PI);
            if (reaction == "Skill" || reaction == "Win" || reaction == "Jump")
            {
                rightArm.localRotation = Quaternion.Euler(0, 0, -125 * wave);
                if (reaction == "Win") leftArm.localRotation = Quaternion.Euler(0, 0, 125 * wave);
                head.localRotation = Quaternion.Euler(0, 0, -8 * wave);
            }
            else if (reaction == "Lose") head.localRotation = Quaternion.Euler(18 * wave, 0, 0);
            else if (zeroExpression) head.localRotation = Quaternion.Euler(0, 0, 12 * wave);
        }

        private Material MakeMaterial(Color color)
        {
            var material = CrwtBoardArt.CreateStandardMaterial("CRWT Chibi Fallback");
            material.color = color;
            material.SetFloat("_Glossiness", .12f);
            materials.Add(material);
            return material;
        }

        private static Transform Joint(string name, Transform parent, Vector3 position)
        {
            var item = new GameObject(name).transform;
            item.SetParent(parent, false);
            item.localPosition = position;
            return item;
        }

        private static Transform Part(string name, Transform parent, Vector3 position, Vector3 scale, Material material)
        {
            var item = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            item.name = name;
            item.transform.SetParent(parent, false);
            item.transform.localPosition = position;
            item.transform.localScale = scale;
            item.GetComponent<Renderer>().sharedMaterial = material;
            var collider = item.GetComponent<Collider>();
            collider.enabled = false;
            Destroy(collider);
            return item.transform;
        }

        private static Transform Eye(Transform parent, string name, float x, Material white, Material iris, Material ink)
        {
            var root = Joint(name, parent, new Vector3(x, -.052f, .214f));
            Part("EyeWhite", root, Vector3.zero, new Vector3(.078f, .108f, .028f), white);
            Part("Iris", root, new Vector3(0, -.004f, .024f), new Vector3(.052f, .078f, .027f), iris);
            Part("Pupil", root, new Vector3(0, -.006f, .045f), new Vector3(.025f, .052f, .018f), ink);
            Part("EyeSpark", root, new Vector3(-.018f, .030f, .061f), Vector3.one * .018f, white);
            return root;
        }

        private static Color EyeColor(string id)
        {
            switch (id)
            {
                case "rindi": return new Color(.14f, .78f, .76f);
                case "kairo": return new Color(.20f, .72f, 1f);
                case "luna": return new Color(.70f, .52f, 1f);
                case "nox": return new Color(.85f, .42f, 1f);
                case "atlas": return new Color(.28f, .80f, .57f);
                default: return new Color(.20f, .82f, 1f);
            }
        }

        private static Color HairColor(string id)
        {
            switch (id)
            {
                case "rindi": return new Color(1f, .40f, .62f);
                case "kairo": return new Color(.14f, .19f, .32f);
                case "luna": return new Color(.68f, .62f, .92f);
                case "nox": return new Color(.10f, .08f, .17f);
                case "atlas": return new Color(.40f, .24f, .12f);
                default: return new Color(.90f, .94f, 1f);
            }
        }

        private static Color OutfitColor(string id)
        {
            switch (id)
            {
                case "rindi": return new Color(.93f, .25f, .48f);
                case "kairo": return new Color(.16f, .56f, .91f);
                case "luna": return new Color(.46f, .30f, .77f);
                case "nox": return new Color(.24f, .15f, .34f);
                case "atlas": return new Color(.17f, .56f, .41f);
                default: return new Color(.16f, .29f, .55f);
            }
        }

        private void OnDestroy()
        {
            foreach (var material in materials) if (material) Destroy(material);
            materials.Clear();
        }
    }
}
