using UnityEngine;
using UnityEngine.EventSystems;

namespace ComePlayers.CrazyRich
{
    public sealed class CrwtCameraOrbit : MonoBehaviour
    {
        public Transform target;
        public float distance = 18f;
        public float yaw = 0f;
        public float pitch = 48f;
        public float rotateSpeed = .18f;
        public float zoomSpeed = 1.2f;
        private Vector2 last;
        private bool dragging;

        private void LateUpdate()
        {
            if (!target) return;

            if (Input.touchCount == 1)
            {
                var t = Input.GetTouch(0);
                if (t.phase == TouchPhase.Moved && (EventSystem.current == null || !EventSystem.current.IsPointerOverGameObject(t.fingerId)))
                {
                    yaw += t.deltaPosition.x * rotateSpeed;
                    pitch = Mathf.Clamp(pitch - t.deltaPosition.y * rotateSpeed, 25f, 72f);
                }
            }
            else if (Input.touchCount >= 2)
            {
                var a = Input.GetTouch(0); var b = Input.GetTouch(1);
                if (EventSystem.current != null && (EventSystem.current.IsPointerOverGameObject(a.fingerId) || EventSystem.current.IsPointerOverGameObject(b.fingerId))) return;
                var prevA = a.position - a.deltaPosition; var prevB = b.position - b.deltaPosition;
                var prev = Vector2.Distance(prevA, prevB); var now = Vector2.Distance(a.position, b.position);
                distance = Mathf.Clamp(distance - (now - prev) * .012f * zoomSpeed, 10f, 28f);
            }
            else
            {
                if (Input.GetMouseButtonDown(0) && (EventSystem.current == null || !EventSystem.current.IsPointerOverGameObject())) { dragging = true; last = Input.mousePosition; }
                if (Input.GetMouseButtonUp(0)) dragging = false;
                if (dragging)
                {
                    var now = (Vector2)Input.mousePosition;
                    var d = now - last; last = now;
                    yaw += d.x * rotateSpeed;
                    pitch = Mathf.Clamp(pitch - d.y * rotateSpeed, 25f, 72f);
                }
                distance = Mathf.Clamp(distance - Input.mouseScrollDelta.y * zoomSpeed, 10f, 28f);
            }

            var rot = Quaternion.Euler(pitch, yaw, 0);
            transform.position = target.position + rot * new Vector3(0, 0, -distance);
            transform.rotation = rot;
        }
    }
}
