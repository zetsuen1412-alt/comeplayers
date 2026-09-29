using System;
using System.Collections;
using UnityEngine;
using UnityEngine.UI;

namespace ComePlayers.CrazyRich
{
    public enum CrwtDiceAnimationState { Idle, Throw, Spin, Bounce, Reveal, ZeroReveal }

    public sealed class CrwtDicePresenter : MonoBehaviour
    {
        public CrwtDiceAnimationState State { get; private set; }
        public bool IsBusy => State != CrwtDiceAnimationState.Idle;
        public bool IsPresenting => result != null;
        public event Action<CrwtLastRoll> ZeroReact;
        public event Action<CrwtLastRoll> Revealed;
        private RectTransform tray;
        private CanvasGroup visibility;
        private readonly RectTransform[] dieRoots = new RectTransform[2];
        private readonly CrwtStarDieGraphic[] dice = new CrwtStarDieGraphic[2];
        private readonly Text[] faces = new Text[2];
        private Text caption;
        private CrwtLastRoll result;
        private Action complete;
        private Coroutine sequence;

        public void Initialize(Transform canvas)
        {
            tray = CrwtUi.Panel(canvas, "Starwheel Dice", new Color(.05f,.03f,.13f,.94f), new Vector2(.25f,.30f), new Vector2(.75f,.75f), Vector2.zero, Vector2.zero);
            tray.GetComponent<Image>().raycastTarget = false;
            visibility = tray.gameObject.AddComponent<CanvasGroup>();
            visibility.blocksRaycasts = false; visibility.interactable = false; visibility.alpha = 0;
            for (int i = 0; i < 2; i++)
            {
                var go = new GameObject("Starwheel " + (i == 0 ? "A" : "B"), typeof(RectTransform), typeof(CrwtStarDieGraphic));
                go.transform.SetParent(tray, false);
                var rt = go.GetComponent<RectTransform>(); dieRoots[i] = rt;
                rt.anchorMin = new Vector2(i == 0 ? .10f : .56f, .29f);
                rt.anchorMax = new Vector2(i == 0 ? .44f : .90f, .93f);
                rt.offsetMin = rt.offsetMax = Vector2.zero;
                dice[i] = go.GetComponent<CrwtStarDieGraphic>(); dice[i].raycastTarget = false;
                dice[i].color = i == 0 ? new Color(.53f,.34f,.93f) : new Color(.95f,.40f,.66f);
                faces[i] = CrwtUi.Text(rt, "?", 76, TextAnchor.MiddleCenter, Color.white);
                faces[i].raycastTarget = false; faces[i].resizeTextForBestFit = true;
                faces[i].resizeTextMinSize = 28; faces[i].resizeTextMaxSize = 76;
                CrwtUi.Fill(faces[i].rectTransform);
            }
            var plus = CrwtUi.Text(tray, "+", 34, TextAnchor.MiddleCenter, CrwtUi.Gold);
            plus.raycastTarget = false;
            plus.rectTransform.anchorMin = new Vector2(.45f,.50f); plus.rectTransform.anchorMax = new Vector2(.55f,.70f);
            plus.rectTransform.offsetMin = plus.rectTransform.offsetMax = Vector2.zero;
            caption = CrwtUi.Text(tray, "", 30, TextAnchor.MiddleCenter, Color.white);
            caption.raycastTarget = false; caption.resizeTextForBestFit = true;
            caption.resizeTextMinSize = 16; caption.resizeTextMaxSize = 30;
            caption.rectTransform.anchorMin = new Vector2(.03f,.02f); caption.rectTransform.anchorMax = new Vector2(.97f,.28f);
            caption.rectTransform.offsetMin = caption.rectTransform.offsetMax = Vector2.zero;
        }

        public void BeginThrow()
        {
            if (IsBusy) return;
            result = null; visibility.alpha = 1;
            tray.SetAsLastSibling();
            caption.text = "STARWHEEL • MENUNGGU HASIL";
            for (int i = 0; i < 2; i++) { dice[i].SetFace(-1); faces[i].text = "?"; }
            sequence = StartCoroutine(Animate());
        }

        public void RevealServerRoll(CrwtLastRoll roll, Action onComplete)
        {
            if (roll == null || !CrwtDiceRules.IsValid(roll.d1, roll.d2, roll.total, roll.doubles, roll.zero_roll, roll.from, roll.to))
                throw new ArgumentException("Invalid authoritative dice result");
            if (IsPresenting) throw new InvalidOperationException("Dice presentation already active");
            if (!IsBusy) BeginThrow();
            result = roll; complete = onComplete;
        }

        public void CancelWaiting()
        {
            if (IsPresenting) return;
            ResetPresentation();
        }

        private IEnumerator Animate()
        {
            bool reduced = PlayerPrefs.GetInt("CRWT_ReducedMotion", 0) == 1;
            State = CrwtDiceAnimationState.Throw;
            for (float t = 0; t < .28f; t += Time.unscaledDeltaTime)
            {
                float progress = Mathf.Clamp01(t / .28f);
                for (int i = 0; i < 2; i++)
                {
                    dieRoots[i].anchoredPosition = reduced ? Vector2.zero : new Vector2(0, Mathf.Lerp(-100, 0, progress));
                    dieRoots[i].localScale = Vector3.one * (reduced ? 1 : Mathf.Lerp(.35f, 1f, progress));
                }
                yield return null;
            }
            State = CrwtDiceAnimationState.Spin;
            float spin = 0;
            while (result == null || spin < .45f)
            {
                spin += Time.unscaledDeltaTime;
                for (int i = 0; i < 2; i++)
                {
                    dieRoots[i].anchoredPosition = Vector2.zero;
                    dieRoots[i].localRotation = reduced ? Quaternion.identity : Quaternion.Euler(0, 0, spin * (i == 0 ? 520 : -470));
                    dieRoots[i].localScale = Vector3.one;
                }
                yield return null;
            }
            State = CrwtDiceAnimationState.Bounce;
            for (float t = 0; t < .25f; t += Time.unscaledDeltaTime)
            {
                for (int i = 0; i < 2; i++)
                {
                    dieRoots[i].localRotation = Quaternion.identity;
                    dieRoots[i].anchoredPosition = reduced ? Vector2.zero : new Vector2(0, Mathf.Abs(Mathf.Sin(t / .25f * Mathf.PI * 2)) * 18 * (1 - t / .25f));
                }
                yield return null;
            }
            for (int i = 0; i < 2; i++)
            {
                int face = i == 0 ? result.d1 : result.d2;
                dice[i].SetFace(face); faces[i].text = face.ToString();
                faces[i].color = face == 0 ? new Color(.65f,1f,.96f) : Color.white;
                dieRoots[i].anchoredPosition = Vector2.zero;
            }
            State = result.zero_roll ? CrwtDiceAnimationState.ZeroReveal : CrwtDiceAnimationState.Reveal;
            caption.text = CrwtDiceRules.Caption(result.d1, result.d2, result.total, result.zero_roll);
            if (result.zero_roll) ZeroReact?.Invoke(result);
            Revealed?.Invoke(result);
            float duration = result.zero_roll ? 1.35f : .8f;
            for (float t = 0; t < duration; t += Time.unscaledDeltaTime)
            {
                for (int i = 0; i < 2; i++) dice[i].SetPulse(reduced ? .5f : .5f + .5f * Mathf.Sin(t * 9));
                yield return null;
            }
            var callback = complete;
            sequence = null; result = null; complete = null;
            visibility.alpha = 0; State = CrwtDiceAnimationState.Idle;
            callback?.Invoke();
        }

        private void ResetPresentation()
        {
            if (sequence != null) StopCoroutine(sequence);
            sequence = null; result = null; complete = null;
            if (visibility) visibility.alpha = 0;
            State = CrwtDiceAnimationState.Idle;
        }
        private void OnDisable() { ResetPresentation(); }
    }
}
