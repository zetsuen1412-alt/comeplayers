using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace ComePlayers.CrazyRich
{
    public sealed class CrwtBoardView : MonoBehaviour
    {
        public event System.Action MovementFinished;
        public bool IsMoving
        {
            get { foreach (var pawn in pawns.Values) if (pawn.move != null) return true; return false; }
        }
        private readonly Vector3[] tiles = new Vector3[32];
        private readonly Dictionary<int, Pawn> pawns = new Dictionary<int, Pawn>();
        private readonly Dictionary<int, GameObject> buildings = new Dictionary<int, GameObject>();
        private readonly Dictionary<int, string> buildingState = new Dictionary<int, string>();
        private static readonly Color[] SeatColors =
        {
            new Color(.95f,.35f,.36f), new Color(.30f,.68f,1f), new Color(.35f,.86f,.50f), new Color(1f,.72f,.22f),
            new Color(.78f,.42f,1f), new Color(.20f,.90f,.88f), new Color(1f,.45f,.75f), new Color(.84f,.88f,.95f)
        };

        private sealed class Pawn { public GameObject root; public int tile; public Coroutine move; }

        public Transform CameraTarget { get; private set; }

        public void Build(string mapId)
        {
            StopAllCoroutines();
            CrwtUi.Clear(transform);
            pawns.Clear(); buildings.Clear(); buildingState.Clear();
            var table = GameObject.CreatePrimitive(PrimitiveType.Cube);
            table.name = "BoardTable"; table.transform.SetParent(transform, false); table.transform.localScale = new Vector3(15.5f, .5f, 15.5f); table.transform.localPosition = new Vector3(0, -.35f, 0);
            table.GetComponent<Renderer>().material.color = MapBase(mapId);
            GenerateTilePositions();
            for (var i = 0; i < 32; i++)
            {
                var t = GameObject.CreatePrimitive(PrimitiveType.Cube);
                t.name = "Tile_" + i; t.transform.SetParent(transform, false); t.transform.localPosition = tiles[i]; t.transform.localScale = new Vector3(1.55f, .22f, 1.55f);
                t.GetComponent<Renderer>().material.color = Color.Lerp(MapAccent(mapId), Color.white, (i % 4) * .08f);
                var label = new GameObject("Label", typeof(TextMesh)); label.transform.SetParent(t.transform, false); label.transform.localPosition = new Vector3(0, .66f, 0); label.transform.localRotation = Quaternion.Euler(90, 0, 0);
                var tm = label.GetComponent<TextMesh>(); tm.text = i.ToString(); tm.fontSize = 38; tm.characterSize = .12f; tm.anchor = TextAnchor.MiddleCenter; tm.color = new Color(.05f,.07f,.10f,1);
            }
            var center = new GameObject("CameraTarget"); center.transform.SetParent(transform, false); center.transform.localPosition = Vector3.zero; CameraTarget = center.transform;
            AddCenterLandmark(mapId);
        }

        public void Apply(CrwtMatchSnapshot snap)
        {
            if (snap?.state?.players == null) return;
            foreach (var p in snap.state.players) EnsurePawn(p, snap.turn_seat == p.seat);
            ApplyProperties(snap.state.properties);
        }

        public void PrepareRoll(CrwtLastRoll roll)
        {
            // Reconcile a skipped snapshot to the server's starting tile before
            // the cinematic. Never turn a ZERO ROLL into catch-up movement.
            if (!pawns.TryGetValue(roll.seat, out var pawn) || !pawn.root) return;
            if (pawn.move != null) { StopCoroutine(pawn.move); pawn.move = null; }
            pawn.tile = roll.from;
            pawn.root.transform.localPosition = TileWithSeatOffset(roll.from, roll.seat);
        }

        private void EnsurePawn(CrwtPlayer p, bool active)
        {
            if (!pawns.TryGetValue(p.seat, out var pawn))
            {
                var root = new GameObject("Pawn_Seat_" + p.seat); root.transform.SetParent(transform, false);
                var body = GameObject.CreatePrimitive(PrimitiveType.Capsule); body.transform.SetParent(root.transform, false); body.transform.localScale = new Vector3(.33f,.48f,.33f); body.transform.localPosition = new Vector3(0,.48f,0); body.GetComponent<Renderer>().material.color = SeatColors[(p.seat - 1) % SeatColors.Length];
                var head = GameObject.CreatePrimitive(PrimitiveType.Sphere); head.transform.SetParent(root.transform, false); head.transform.localScale = Vector3.one * .55f; head.transform.localPosition = new Vector3(0,1.08f,0); head.GetComponent<Renderer>().material.color = CharacterHair(p.character_id);
                pawn = new Pawn { root = root, tile = p.position }; pawns[p.seat] = pawn; root.transform.localPosition = TileWithSeatOffset(p.position, p.seat);
            }
            if (pawn.tile != p.position)
            {
                if (pawn.move != null) StopCoroutine(pawn.move);
                pawn.move = StartCoroutine(MovePawn(pawn, pawn.tile, p.position, p.seat));
                pawn.tile = p.position;
            }
            var scale = active ? 1.12f : 1f;
            pawn.root.transform.localScale = Vector3.one * scale;
            pawn.root.SetActive(!p.bankrupt);
        }

        private IEnumerator MovePawn(Pawn pawn, int from, int to, int seat)
        {
            var steps = ((to - from) + 32) % 32;
            if (steps == 0) yield break;
            for (var s = 1; s <= steps; s++)
            {
                var tile = (from + s) % 32;
                var a = pawn.root.transform.localPosition;
                var b = TileWithSeatOffset(tile, seat);
                for (var t = 0f; t < 1f; t += Time.deltaTime * 5.5f)
                {
                    var pos = Vector3.Lerp(a, b, t);
                    pos.y += Mathf.Sin(t * Mathf.PI) * .55f;
                    pawn.root.transform.localPosition = pos;
                    yield return null;
                }
                pawn.root.transform.localPosition = b;
            }
            pawn.move = null;
            MovementFinished?.Invoke();
        }

        public void ReactToZero(int seat)
        {
            if (pawns.TryGetValue(seat, out var pawn) && pawn.root && pawn.move == null)
                StartCoroutine(ZeroReaction(pawn));
        }

        private IEnumerator ZeroReaction(Pawn pawn)
        {
            // Only tilt the character; its position and tile remain unchanged.
            for (float t = 0; t < .65f; t += Time.unscaledDeltaTime)
            {
                if (!pawn.root) yield break;
                pawn.root.transform.localRotation = Quaternion.Euler(0, 0, Mathf.Sin(t * 16) * 9 * (1 - t / .65f));
                yield return null;
            }
            if (pawn.root) pawn.root.transform.localRotation = Quaternion.identity;
        }

        private void ApplyProperties(Dictionary<string, CrwtPropertyState> properties)
        {
            var seen = new HashSet<int>();
            if (properties != null)
            {
                foreach (var kv in properties)
                {
                    if (!int.TryParse(kv.Key, out var tile) || tile < 0 || tile >= 32) continue;
                    var p = kv.Value; if (p == null || p.owner_seat <= 0) continue;
                    seen.Add(tile);
                    var sig = p.owner_seat + ":" + p.level;
                    if (buildingState.TryGetValue(tile, out var oldSig) && oldSig == sig && buildings.ContainsKey(tile)) continue;
                    if (buildings.TryGetValue(tile, out var old) && old) Destroy(old);
                    var root = new GameObject("Property_" + tile); root.transform.SetParent(transform, false); root.transform.localPosition = tiles[tile] + new Vector3(0, .35f, 0);
                    var levels = Mathf.Clamp(p.level + 1, 1, 5);
                    for (var i = 0; i < levels; i++)
                    {
                        var g = GameObject.CreatePrimitive(i == 4 ? PrimitiveType.Cylinder : PrimitiveType.Cube); g.transform.SetParent(root.transform, false);
                        g.transform.localPosition = new Vector3((i - (levels-1)*.5f)*.20f, .18f + i*.10f, 0); g.transform.localScale = new Vector3(.20f,.30f+i*.08f,.20f);
                        g.GetComponent<Renderer>().material.color = SeatColors[(p.owner_seat - 1) % SeatColors.Length];
                    }
                    buildings[tile] = root; buildingState[tile] = sig;
                }
            }
            var remove = new List<int>();
            foreach (var kv in buildings) if (!seen.Contains(kv.Key)) remove.Add(kv.Key);
            foreach (var tile in remove)
            {
                if (buildings[tile]) Destroy(buildings[tile]);
                buildings.Remove(tile); buildingState.Remove(tile);
            }
        }

        private void GenerateTilePositions()
        {
            const float edge = 6.8f;
            for (var i=0;i<8;i++) tiles[i] = new Vector3(Mathf.Lerp(-edge, edge, i/7f), 0, -edge);
            for (var i=0;i<8;i++) tiles[8+i] = new Vector3(edge, 0, Mathf.Lerp(-edge, edge, i/7f));
            for (var i=0;i<8;i++) tiles[16+i] = new Vector3(Mathf.Lerp(edge, -edge, i/7f), 0, edge);
            for (var i=0;i<8;i++) tiles[24+i] = new Vector3(-edge, 0, Mathf.Lerp(edge, -edge, i/7f));
        }

        private Vector3 TileWithSeatOffset(int tile, int seat)
        {
            tile = ((tile % 32) + 32) % 32;
            var angle = (seat - 1) * Mathf.PI * .75f;
            return tiles[tile] + new Vector3(Mathf.Cos(angle)*.28f, .55f, Mathf.Sin(angle)*.28f);
        }

        private void AddCenterLandmark(string map)
        {
            var g = GameObject.CreatePrimitive(map == "candy_world" ? PrimitiveType.Sphere : PrimitiveType.Cylinder);
            g.name = "MapLandmark"; g.transform.SetParent(transform, false); g.transform.localPosition = new Vector3(0, 1.1f, 0); g.transform.localScale = map == "fantasy_kingdom" ? new Vector3(1.7f, 3.8f, 1.7f) : new Vector3(2.2f, 2.2f, 2.2f); g.GetComponent<Renderer>().material.color = MapAccent(map);
        }

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
        private static Color CharacterHair(string id) => id switch
        {
            "alexia" => new Color(.90f,.94f,1f), "rindi" => new Color(1f,.48f,.66f), "kairo" => new Color(.20f,.66f,.70f),
            "luna" => new Color(1f,.40f,.62f), "nox" => new Color(.12f,.15f,.24f), "atlas" => new Color(.10f,.45f,.62f), _ => Color.white
        };
    }
}
