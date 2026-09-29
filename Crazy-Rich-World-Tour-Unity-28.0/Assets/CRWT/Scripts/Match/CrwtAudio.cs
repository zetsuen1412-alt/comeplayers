using System.Collections.Generic;
using UnityEngine;

namespace ComePlayers.CrazyRich
{
    // Original short musical cues synthesized once. No samples or gameplay RNG.
    public sealed class CrwtAudio : MonoBehaviour
    {
        private readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();
        private AudioSource source;
        private void Awake()
        {
            source = gameObject.AddComponent<AudioSource>(); source.playOnAwake = false; source.spatialBlend = 0;
            Make("throw", new[] { 180f, 240f, 310f }, .065f);
            Make("reveal", new[] { 523.25f, 659.25f, 783.99f }, .10f);
            Make("zero", new[] { 880f, 659.25f, 1046.5f, 1318.5f }, .13f);
            Make("gain", new[] { 783.99f, 1046.5f }, .085f);
            Make("pay", new[] { 392f, 329.63f }, .10f);
            Make("build", new[] { 261.63f, 392f, 523.25f }, .085f);
            Make("step", new[] { 220f }, .045f);
            Make("win", new[] { 523.25f, 659.25f, 783.99f, 1046.5f }, .17f);
        }
        private void Make(string name, float[] notes, float seconds)
        {
            const int rate = 22050;
            int count = Mathf.RoundToInt(rate * seconds), length = count * notes.Length;
            var data = new float[length];
            for (int i = 0; i < length; i++)
            {
                float t = (i % count) / (float)rate, phase = 2 * Mathf.PI * notes[i / count] * t;
                float envelope = Mathf.Min(1, t / .008f) * Mathf.Pow(1 - (i % count) / (float)count, 2);
                data[i] = (Mathf.Sin(phase) + .18f * Mathf.Sin(phase * 2)) * envelope * .22f;
            }
            var clip = AudioClip.Create("CRWT " + name, length, 1, rate, false); clip.SetData(data, 0); clips.Add(name, clip);
        }
        public void Play(string cue)
        {
            if (PlayerPrefs.GetInt("CRWT_Mute", 0) == 0 && clips.TryGetValue(cue, out var clip)) source.PlayOneShot(clip, .6f);
        }
        private void OnDestroy() { foreach (var clip in clips.Values) if (clip) Destroy(clip); }
    }
}
