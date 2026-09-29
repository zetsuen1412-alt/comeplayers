using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace ComePlayers.CrazyRich
{
    public sealed class CrwtBoardView : MonoBehaviour
    {
        public event System.Action MovementFinished;
        public event System.Action StepFinished;
        public bool IsMoving
        {
            get { foreach (var pawn in pawns.Values) if (pawn.move != null) return true; return false; }
        }
        public Transform CameraTarget { get; private set; }
        private readonly Vector3[] tiles = new Vector3[CrwtBoardLayout.TileCount];
        private readonly Dictionary<int, Pawn> pawns = new Dictionary<int, Pawn>();
        private readonly Dictionary<int, PropertyView> properties = new Dictionary<int, PropertyView>();
        private readonly GameObject[] festivalRings = new GameObject[CrwtBoardLayout.TileCount];
        private CrwtBoardArt art;
        private CrwtLastRoll preparedRoll;
        private string currentMap;
        private bool propertiesInitialized;
        private static bool ReducedMotion => PlayerPrefs.GetInt("CRWT_ReducedMotion", 0) == 1;
        private static readonly Color[] SeatColors =
        {
            new Color(.95f,.35f,.36f), new Color(.30f,.68f,1f), new Color(.35f,.86f,.50f), new Color(1f,.72f,.22f),
            new Color(.78f,.42f,1f), new Color(.20f,.90f,.88f), new Color(1f,.45f,.75f), new Color(.84f,.88f,.95f)
        };
        private sealed class Pawn
        {
            public GameObject root, turnRing;
            public CrwtCharacterView character;
            public int tile;
            public Coroutine move;
        }
        private sealed class PropertyView
        {
            public GameObject root;
            public int owner, level;
            public Coroutine animation;
        }

        public void Build(string mapId)
        {
            StopAllCoroutines();
            foreach (Transform child in transform) child.gameObject.SetActive(false);
            CrwtUi.Clear(transform);
            pawns.Clear(); properties.Clear(); preparedRoll = null; propertiesInitialized = false;
            art?.Dispose(); art = new CrwtBoardArt(); currentMap = mapId ?? "world_tour";
            art.Shape(transform, "BoardTable", PrimitiveType.Cube, new Vector3(0, -.35f, 0), new Vector3(15.6f, .5f, 15.6f), MapBase(currentMap));
            art.Shape(transform, "BoardInlay", PrimitiveType.Cube, new Vector3(0, -.055f, 0), new Vector3(11.7f, .05f, 11.7f), Color.Lerp(MapBase(currentMap), MapAccent(currentMap), .16f));
            for (int i = 0; i < CrwtBoardLayout.TileCount; i++)
            {
                var point = CrwtBoardLayout.Position(i); tiles[i] = new Vector3(point.X, 0, point.Z); BuildTile(i);
            }
            var center = new GameObject("CameraTarget"); center.transform.SetParent(transform, false); CameraTarget = center.transform;
            AddCenterLandmark(currentMap);
        }

        private void BuildTile(int index)
        {
            var info = CrwtTileCatalog.Get(currentMap, index);
            var tile = new GameObject("Tile_" + index + "_" + info.Name);
            tile.transform.SetParent(transform, false); tile.transform.localPosition = tiles[index]; tile.transform.localRotation = TileRotation(index);
            var color = TileColor(info);
            art.Shape(tile.transform, "Enamel Tile", PrimitiveType.Cube, Vector3.zero, new Vector3(1.55f, .22f, 1.55f), art.Cream);
            art.Shape(tile.transform, "Tile Band", PrimitiveType.Cube, new Vector3(0, .12f, .58f), new Vector3(1.4f, .035f, .22f), color);
            art.Label(tile.transform, "City Name", WrapName(info.Name), new Vector3(0, .135f, -.51f), .075f, art.Ink, 1.32f, .32f);
            art.Label(tile.transform, "Tile Number", index.ToString("00"), new Vector3(-.56f, .14f, .30f), .06f, art.Ink, .24f, .16f);
            var symbol = TileSymbol(info.Kind);
            if (!string.IsNullOrEmpty(symbol)) art.Label(tile.transform, "Special Icon", symbol, new Vector3(0, .145f, .16f), .23f, color, .55f, .42f);
            var festival = art.Ring(tile.transform, "Festival Highlight", new Vector3(0, .155f, 0), 1.06f, art.Gold, true);
            festival.SetActive(false); festivalRings[index] = festival;
        }

        public void Apply(CrwtMatchSnapshot snap)
        {
            if (snap?.state?.players == null) return;
            if (art == null || currentMap != (snap.state.map_id ?? "world_tour")) Build(snap.state.map_id);
            foreach (var player in snap.state.players)
                if (player != null) EnsurePawn(player, snap.turn_seat == player.seat && snap.status != "finished");
            preparedRoll = null; ApplyProperties(snap.state.properties);
            for (int i = 0; i < festivalRings.Length; i++)
            {
                var group = CrwtTileCatalog.Get(currentMap, i).Group;
                festivalRings[i].SetActive(group >= 0 && snap.state.festival_group == group && snap.round <= snap.state.festival_until_round);
            }
        }

        public void PrepareRoll(CrwtLastRoll roll)
        {
            preparedRoll = roll;
            if (roll == null || !pawns.TryGetValue(roll.seat, out var pawn) || !pawn.root) return;
            // Reconcile before the cinematic. Never turn zero into catch-up walking.
            StopPawn(pawn); pawn.tile = CrwtBoardLayout.Normalize(roll.from);
            pawn.root.transform.localPosition = TileWithSeatOffset(pawn.tile, roll.seat);
        }

        private void EnsurePawn(CrwtPlayer player, bool active)
        {
            if (player == null) return;
            var destination = CrwtBoardLayout.Normalize(player.position);
            if (!pawns.TryGetValue(player.seat, out var pawn))
            {
                var root = new GameObject("Pawn_Seat_" + player.seat); root.transform.SetParent(transform, false);
                var character = root.AddComponent<CrwtCharacterView>(); character.Initialize(player.character_id);
                var ring = art.Ring(root.transform, "Active Player Ring", new Vector3(0, .006f, 0), .37f, SeatColor(player.seat));
                art.Label(root.transform, "Seat Number", player.seat.ToString(), new Vector3(.3f, .01f, -.27f), .065f, art.Cream, .16f, .16f);
                pawn = new Pawn { root = root, tile = destination, character = character, turnRing = ring };
                pawns.Add(player.seat, pawn); root.transform.localPosition = TileWithSeatOffset(destination, player.seat);
            }
            pawn.turnRing.SetActive(active);
            if (player.bankrupt) { StopPawn(pawn); pawn.tile = destination; pawn.root.SetActive(false); return; }
            pawn.root.SetActive(true);
            var from = pawn.tile;
            var roll = preparedRoll;
            var walk = roll != null && CrwtBoardLayout.HasRollPath(player.seat, from, destination, roll.seat, roll.from, roll.to, roll.total, roll.zero_roll);
            // A bot can travel back to its starting tile after a nonzero roll.
            // It still gets the received dice path; only zero skips movement.
            if (pawn.tile == destination && !walk) return;
            StopPawn(pawn); pawn.tile = destination;
            if (ReducedMotion) { pawn.root.transform.localPosition = TileWithSeatOffset(destination, player.seat); return; }
            pawn.move = StartCoroutine(MovePawn(pawn, from, destination, player.seat, walk ? roll.total : 0));
        }

        private IEnumerator MovePawn(Pawn pawn, int from, int to, int seat, int steps)
        {
            // Walk exactly the received dice total. Bot travel then transitions
            // from its landing tile to the final server destination. Other state
            // changes get a direct transition, never an invented lap or START event.
            pawn.character.SetMoving(steps > 0);
            for (int step = 1; step <= steps; step++)
            {
                yield return MoveSegment(pawn, TileWithSeatOffset(CrwtBoardLayout.LandingTile(from, step), seat), .14f, .20f);
                StepFinished?.Invoke();
            }
            var final = TileWithSeatOffset(to, seat);
            if ((pawn.root.transform.localPosition - final).sqrMagnitude > .001f)
            {
                pawn.character.SetMoving(false); yield return MoveSegment(pawn, final, .35f, .6f);
            }
            pawn.root.transform.localPosition = final; pawn.character.SetMoving(false); pawn.move = null; MovementFinished?.Invoke();
        }

        private IEnumerator MoveSegment(Pawn pawn, Vector3 destination, float duration, float arc)
        {
            var origin = pawn.root.transform.localPosition;
            pawn.character.FaceDirection(transform.TransformDirection(destination - origin));
            for (float elapsed = 0; elapsed < duration; elapsed += Time.unscaledDeltaTime)
            {
                if (ReducedMotion) break;
                var t = elapsed / duration; var position = Vector3.Lerp(origin, destination, t);
                position.y += Mathf.Sin(t * Mathf.PI) * arc; pawn.root.transform.localPosition = position; yield return null;
            }
            pawn.root.transform.localPosition = destination;
        }

        private void StopPawn(Pawn pawn)
        {
            if (pawn.move != null) StopCoroutine(pawn.move);
            pawn.move = null; if (pawn.character) pawn.character.SetMoving(false);
        }
        public void ReactToZero(int seat)
        {
            if (pawns.TryGetValue(seat, out var pawn) && pawn.root && pawn.move == null) pawn.character.ReactToZero();
        }
        public void PlaySkill(int seat)
        {
            if (pawns.TryGetValue(seat, out var pawn) && pawn.root && pawn.move == null) pawn.character.PlayReaction("Skill");
        }
        public void PlayResults(int winnerSeat)
        {
            foreach (var entry in pawns)
                if (entry.Value.root && entry.Value.root.activeInHierarchy) entry.Value.character.PlayReaction(entry.Key == winnerSeat ? "Win" : "Lose");
        }

        private void ApplyProperties(Dictionary<string, CrwtPropertyState> state)
        {
            var seen = new HashSet<int>();
            if (state != null) foreach (var entry in state)
            {
                if (!int.TryParse(entry.Key, out var tile) || tile < 0 || tile >= tiles.Length) continue;
                var property = entry.Value; if (property == null || property.owner_seat <= 0) continue;
                seen.Add(tile);
                if (properties.TryGetValue(tile, out var old) && old.owner == property.owner_seat && old.level == property.level) continue;
                var animate = propertiesInitialized && (old == null || property.level > old.level);
                if (old != null)
                {
                    if (old.animation != null) StopCoroutine(old.animation);
                    old.root.SetActive(false); Destroy(old.root);
                }
                var root = new GameObject("Property_" + tile);
                root.transform.SetParent(transform, false); root.transform.localPosition = tiles[tile] + Vector3.up * .125f; root.transform.localRotation = TileRotation(tile);
                art.Ring(root.transform, "Owner Ring Seat " + property.owner_seat, Vector3.zero, 1.025f, SeatColor(property.owner_seat), true);
                var model = new GameObject("Building"); model.transform.SetParent(root.transform, false); model.transform.localPosition = new Vector3(0, 0, .22f);
                CrwtPropertyVisual.Build(art, model.transform, property.level, SeatColor(property.owner_seat));
                var view = new PropertyView { root = root, owner = property.owner_seat, level = property.level }; properties[tile] = view;
                if (animate && !ReducedMotion) view.animation = StartCoroutine(BuildPop(model.transform, view));
            }
            var removed = new List<int>(); foreach (var entry in properties) if (!seen.Contains(entry.Key)) removed.Add(entry.Key);
            foreach (var tile in removed)
            {
                var property = properties[tile]; if (property.animation != null) StopCoroutine(property.animation);
                property.root.SetActive(false); Destroy(property.root); properties.Remove(tile);
            }
            propertiesInitialized = true;
        }

        private static IEnumerator BuildPop(Transform building, PropertyView property)
        {
            const float duration = .3f;
            for (float elapsed = 0; elapsed < duration; elapsed += Time.unscaledDeltaTime)
            {
                if (!building || ReducedMotion) break;
                building.localScale = Vector3.one * (1f + Mathf.Sin(elapsed / duration * Mathf.PI) * .18f); yield return null;
            }
            if (building) building.localScale = Vector3.one; property.animation = null;
        }

        private Vector3 TileWithSeatOffset(int tile, int seat)
        {
            tile = CrwtBoardLayout.Normalize(tile); var angle = ((seat - 1) % 8) * Mathf.PI * .25f;
            return tiles[tile] + TileRotation(tile) * new Vector3(Mathf.Cos(angle) * .24f, .125f, -.20f + Mathf.Sin(angle) * .21f);
        }

        private void AddCenterLandmark(string map)
        {
            var root = new GameObject("World Tour Miniature Plaza"); root.transform.SetParent(transform, false); var accent = MapAccent(map);
            art.Shape(root.transform, "Plaza", PrimitiveType.Cylinder, Vector3.zero, new Vector3(5.4f, .10f, 5.4f), art.Ink);
            art.Ring(root.transform, "Golden Route", new Vector3(0, .11f, 0), 2.3f, art.Gold);
            if (map == "world_tour")
            {
                art.Shape(root.transform, "Globe Pedestal", PrimitiveType.Cylinder, new Vector3(0, .36f, 0), new Vector3(1.25f, .26f, 1.25f), art.Cream);
                art.Shape(root.transform, "World Globe", PrimitiveType.Sphere, new Vector3(0, 1.35f, 0), Vector3.one * 1.65f, accent);
                var orbit = art.Ring(root.transform, "Globe Orbit", new Vector3(0, 1.35f, 0), 1.18f, art.Gold); orbit.transform.localRotation = Quaternion.Euler(28, 0, 18);
                var meridian = art.Ring(root.transform, "Globe Meridian", new Vector3(0, 1.35f, 0), .855f, art.Cream); meridian.transform.localRotation = Quaternion.Euler(90, 0, 25);
                AddMiniTower(root.transform, new Vector3(-1.7f, .1f, .3f), .9f, art.Gold);
                AddMiniTower(root.transform, new Vector3(1.7f, .1f, .3f), .72f, art.Cream);
            }
            else if (map == "candy_world")
            {
                art.Shape(root.transform, "Candy Stem", PrimitiveType.Cylinder, new Vector3(0, .85f, 0), new Vector3(.18f, .75f, .18f), art.Cream);
                art.Shape(root.transform, "Candy Crown", PrimitiveType.Sphere, new Vector3(0, 1.8f, 0), Vector3.one * 1.65f, accent);
            }
            else if (map == "tropical_paradise")
            {
                art.Shape(root.transform, "Resort Island", PrimitiveType.Sphere, new Vector3(0, .15f, 0), new Vector3(3.2f, .6f, 2.3f), art.Cream);
                art.Shape(root.transform, "Palm Trunk", PrimitiveType.Cylinder, new Vector3(.25f, 1f, .2f), new Vector3(.18f, .85f, .18f), art.Gold);
                for (int i = 0; i < 4; i++)
                {
                    var leaf = art.Shape(root.transform, "Palm Leaf", PrimitiveType.Sphere, new Vector3(.25f, 1.9f, .2f), new Vector3(2.1f, .18f, .5f), accent);
                    leaf.transform.localRotation = Quaternion.Euler(0, i * 45, 0);
                }
            }
            else
            {
                AddMiniTower(root.transform, new Vector3(0, .1f, 0), 2.2f, accent);
                if (map == "fantasy_kingdom")
                {
                    AddMiniTower(root.transform, new Vector3(-1.1f, .1f, 0), 1.2f, art.Gold);
                    AddMiniTower(root.transform, new Vector3(1.1f, .1f, 0), 1.2f, art.Gold);
                }
            }
            art.Label(root.transform, "Board Title", "CRAZY RICH", new Vector3(0, .03f, -3.35f), .36f, art.Cream, 8.8f, .65f);
            art.Label(root.transform, "Map Title", MapTitle(map), new Vector3(0, .03f, -3.95f), .17f, accent, 8.8f, .32f);
        }
        private void AddMiniTower(Transform parent, Vector3 origin, float height, Color color)
        {
            art.Shape(parent, "Miniature Tower", PrimitiveType.Cube, origin + Vector3.up * height * .5f, new Vector3(.5f, height, .5f), color);
            art.Roof(parent, origin + Vector3.up * height, new Vector3(.72f, height * .3f, .72f), art.Gold);
        }
        private static Quaternion TileRotation(int tile) => Quaternion.Euler(0, -(CrwtBoardLayout.Normalize(tile) / 8) * 90, 0);
        private static Color SeatColor(int seat) => SeatColors[((seat - 1) % SeatColors.Length + SeatColors.Length) % SeatColors.Length];
        private static string WrapName(string value)
        {
            if (value.Length <= 12) return value;
            var split = value.LastIndexOf(' ', Mathf.Min(12, value.Length - 1));
            return split > 0 ? value.Substring(0, split) + "\n" + value.Substring(split + 1) : value;
        }
        private static string TileSymbol(string kind) => kind switch
        {
            "start" => ">>", "chance" => "?", "bonus" => "+", "tax" => "$", "travel" => ">",
            "festival" => "*", "island" => "!", "resort" => "~", _ => null
        };
        private Color TileColor(CrwtTileInfo info)
        {
            if (info.Group >= 0) return Color.HSVToRGB((info.Group * .083f + .02f) % 1f, .53f, .85f);
            return info.Kind switch
            {
                "start" => new Color(.13f,.66f,.48f), "chance" => new Color(.65f,.35f,.9f),
                "festival" => new Color(.91f,.37f,.61f), "tax" => new Color(.83f,.32f,.3f),
                "island" => new Color(.38f,.48f,.62f), "bonus" => new Color(.85f,.62f,.15f), _ => MapAccent(currentMap)
            };
        }
        private static string MapTitle(string map) => map switch
        {
            "tokyo_rush" => "TOKYO RUSH", "tropical_paradise" => "TROPICAL PARADISE",
            "candy_world" => "CANDY WORLD", "fantasy_kingdom" => "FANTASY KINGDOM", _ => "WORLD TOUR"
        };
        private static Color MapBase(string id) => id switch
        {
            "tokyo_rush" => new Color(.18f,.08f,.16f), "tropical_paradise" => new Color(.04f,.20f,.19f),
            "candy_world" => new Color(.24f,.10f,.22f), "fantasy_kingdom" => new Color(.08f,.08f,.20f), _ => new Color(.035f,.11f,.19f)
        };
        private static Color MapAccent(string id) => id switch
        {
            "tokyo_rush" => new Color(1f,.40f,.67f), "tropical_paradise" => new Color(.25f,.92f,.72f),
            "candy_world" => new Color(1f,.62f,.30f), "fantasy_kingdom" => new Color(.60f,.44f,1f), _ => new Color(.20f,.73f,1f)
        };
        private void OnDisable()
        {
            StopAllCoroutines();
            foreach (var entry in pawns)
            {
                var pawn = entry.Value; pawn.move = null;
                if (pawn.root) pawn.root.transform.localPosition = TileWithSeatOffset(pawn.tile, entry.Key);
                if (pawn.character) pawn.character.SetMoving(false);
            }
        }
        private void OnDestroy() { art?.Dispose(); art = null; }
    }
}
