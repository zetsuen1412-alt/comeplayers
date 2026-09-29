using System;
using UnityEngine;
using UnityEngine.EventSystems;

namespace ComePlayers.CrazyRich
{
    // Tap inspection only. Never dispatches purchases or movement.
    public sealed class CrwtBoardPicker : MonoBehaviour
    {
        public event Action<int> Selected;
        private Vector2 origin;
        private bool tracking;
        private int finger;
        private void Update()
        {
            if (Input.touchCount > 1) { tracking = false; return; }
            if (Input.touchCount == 1)
            {
                var touch = Input.GetTouch(0);
                if (touch.phase == TouchPhase.Began) Begin(touch.position, touch.fingerId);
                else if (touch.phase == TouchPhase.Canceled) tracking = false;
                else if (touch.phase == TouchPhase.Ended) End(touch.position, touch.fingerId);
                return;
            }
            if (Input.GetMouseButtonDown(0)) Begin(Input.mousePosition, -1);
            if (Input.GetMouseButtonUp(0)) End(Input.mousePosition, -1);
        }
        private void Begin(Vector2 point, int id)
        {
            origin = point; finger = id;
            tracking = EventSystem.current == null || !EventSystem.current.IsPointerOverGameObject(id);
        }
        private void End(Vector2 point, int id)
        {
            bool tap = tracking && finger == id && Vector2.Distance(point, origin) <= Mathf.Max(14, Screen.width * .012f);
            tracking = false;
            if (!tap || (EventSystem.current != null && EventSystem.current.IsPointerOverGameObject(id))) return;
            var camera = Camera.main; if (!camera) return;
            var ray = camera.ScreenPointToRay(point);
            if (!new Plane(transform.up, transform.position).Raycast(ray, out float distance)) return;
            var hit = transform.InverseTransformPoint(ray.GetPoint(distance));
            for (int i = 0; i < CrwtBoardLayout.TileCount; i++)
            {
                var tile = CrwtBoardLayout.Position(i);
                if (Mathf.Abs(hit.x - tile.X) <= .76f && Mathf.Abs(hit.z - tile.Z) <= .76f)
                { Selected?.Invoke(i); return; }
            }
        }
    }
}
