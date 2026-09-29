using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using GLTFast;
using UnityEngine;

namespace ComePlayers.CrazyRich
{
    /// <summary>Character presentation only. The board owns the pawn's position.</summary>
    public sealed class CrwtCharacterView : MonoBehaviour
    {
        public const string ReducedMotionPreference = "CRWT_ReducedMotion";
        public const float DisplayHeight = 1.15f;
        public bool HasImportedModel { get; private set; }
        public string CharacterId { get; private set; }

        private Transform facing;
        private Transform reactionPivot;
        private GameObject fallback;
        private GameObject importedModel;
        private CrwtChibiFallback fallbackRig;
        private GltfImport importedResources;
        private CancellationTokenSource loading;
        private Animation clips;
        private readonly List<Material> ownedMaterials = new List<Material>();
        private bool moving;
        private bool zeroReaction;
        private bool reducedMotion;
        private float reactionUntil;
        private float reactionStart;
        private float desiredYaw = 180;
        private string reactionClip;
        private string playingClip;
        private int generation;

        public void Initialize(string characterId)
        {
            var id = NormalizeCharacterId(characterId);
            if (CharacterId == id && facing) return;
            ClearVisual();
            CharacterId = id;
            reducedMotion = PlayerPrefs.GetInt(ReducedMotionPreference, 0) != 0;
            facing = new GameObject("CharacterFacing").transform;
            facing.SetParent(transform, false);
            facing.localRotation = Quaternion.Euler(0, desiredYaw, 0);
            reactionPivot = new GameObject("CharacterReaction").transform;
            reactionPivot.SetParent(facing, false);
            fallback = new GameObject("ChibiFallback_" + id);
            fallback.transform.SetParent(reactionPivot, false);
            fallbackRig = fallback.AddComponent<CrwtChibiFallback>();
            fallbackRig.Build(id);
            loading = new CancellationTokenSource();
            _ = LoadCharacterAsync(id, generation, reactionPivot, loading.Token);
        }

        public void SetMoving(bool value)
        {
            moving = value;
            if (!zeroReaction && reactionUntil <= Time.unscaledTime) PlayLocomotion();
        }

        public void FaceDirection(Vector3 worldDirection)
        {
            if (!facing || worldDirection.sqrMagnitude < .0001f) return;
            var local = transform.InverseTransformDirection(worldDirection);
            local.y = 0;
            if (local.sqrMagnitude > .0001f)
                desiredYaw = Mathf.Atan2(local.x, local.z) * Mathf.Rad2Deg;
        }

        public void PlayReaction(string clipName)
        {
            if (!reactionPivot || string.IsNullOrEmpty(clipName)) return;
            switch (clipName.ToLowerInvariant())
            {
                case "jump": reactionClip = "Jump"; break;
                case "skill": reactionClip = "Skill"; break;
                case "win": reactionClip = "Win"; break;
                case "lose": reactionClip = "Lose"; break;
                default: return;
            }
            zeroReaction = false;
            reactionPivot.localRotation = Quaternion.identity;
            reactionStart = Time.unscaledTime;
            var clip = clips ? clips[reactionClip] : null;
            reactionUntil = reactionStart + (reducedMotion ? .4f : Mathf.Clamp(clip?.length ?? 1f, .5f, 2.2f));
            if (!reducedMotion) PlayClip(reactionClip, false);
            else FreezeIdle();
        }

        public void ReactToZero()
        {
            if (!reactionPivot) return;
            moving = false;
            zeroReaction = true;
            reactionClip = null;
            reactionStart = Time.unscaledTime;
            reactionUntil = reactionStart + (reducedMotion ? .4f : .75f);
            // Freeze the imported pose: ZERO must never play Jump or root translation.
            FreezeIdle();
            fallbackRig?.SetZeroExpression(true);
        }

        private void Update()
        {
            if (!facing) return;
            var preference = PlayerPrefs.GetInt(ReducedMotionPreference, 0) != 0;
            if (preference != reducedMotion)
            {
                reducedMotion = preference;
                if (reducedMotion) { reactionPivot.localRotation = Quaternion.identity; FreezeIdle(); }
                else if (reactionUntil <= Time.unscaledTime) PlayLocomotion();
            }
            facing.localRotation = reducedMotion ? Quaternion.Euler(0, desiredYaw, 0)
                : Quaternion.Slerp(facing.localRotation, Quaternion.Euler(0, desiredYaw, 0), Time.unscaledDeltaTime * 13);
            if (reactionUntil > Time.unscaledTime)
            {
                var progress = Mathf.Clamp01((Time.unscaledTime - reactionStart) / (reactionUntil - reactionStart));
                if (zeroReaction && !reducedMotion)
                    reactionPivot.localRotation = Quaternion.Euler(0, 0, Mathf.Sin(progress * Mathf.PI * 4) * 9 * (1 - progress));
                fallbackRig?.Animate(moving: false, reducedMotion: reducedMotion, reaction: zeroReaction ? "Zero" : reactionClip, progress: progress);
                return;
            }
            if (zeroReaction || reactionClip != null)
            {
                zeroReaction = false;
                reactionClip = null;
                reactionPivot.localRotation = Quaternion.identity;
                fallbackRig?.SetZeroExpression(false);
                PlayLocomotion();
            }
            fallbackRig?.Animate(moving, reducedMotion, null, 0);
        }

        private void PlayLocomotion()
        {
            if (reducedMotion) { FreezeIdle(); return; }
            PlayClip(moving ? "Walk" : "Idle", true);
        }

        private void FreezeIdle()
        {
            if (!clips) return;
            var idle = clips["Idle"];
            if (idle != null)
            {
                clips.Play("Idle");
                idle.time = 0;
                idle.speed = 0;
                clips.Sample();
            }
            clips.Stop();
            playingClip = null;
        }

        private void PlayClip(string name, bool loop)
        {
            if (!clips || clips[name] == null || !clips.gameObject.activeInHierarchy) return;
            if (playingClip == name && clips.IsPlaying(name)) return;
            var state = clips[name];
            state.speed = name == "Walk" ? 1.25f : 1f;
            state.time = 0;
            state.wrapMode = loop ? WrapMode.Loop : WrapMode.ClampForever;
            clips.CrossFade(name, .12f);
            playingClip = name;
        }

        private async Task LoadCharacterAsync(string id, int requestGeneration, Transform parent, CancellationToken cancellation)
        {
            GltfImport resources = null;
            GameObject candidate = null;
            try
            {
                resources = new GltfImport();
                var settings = new ImportSettings { AnimationMethod = AnimationMethod.Legacy, NodeNameMethod = NameImportMethod.OriginalUnique };
                var url = StreamingAssetUrl(id);
                if (!await resources.Load(url, settings, cancellation))
                    throw new InvalidOperationException("The packaged character could not be loaded.");
                cancellation.ThrowIfCancellationRequested();
                if (!this || requestGeneration != generation || !parent) return;
                candidate = new GameObject("CharacterGLB_" + id);
                candidate.transform.SetParent(parent, false);
                candidate.SetActive(false);
                if (!await resources.InstantiateMainSceneAsync(candidate.transform, cancellation))
                    throw new InvalidOperationException("The packaged character could not be instantiated.");
                cancellation.ThrowIfCancellationRequested();
                if (!this || requestGeneration != generation || !parent) return;
                foreach (var animator in candidate.GetComponentsInChildren<Animator>(true)) animator.applyRootMotion = false;
                NormalizeBounds(candidate.transform);
                var importedClips = candidate.GetComponentInChildren<Animation>(true);
                if (!importedClips || importedClips["Idle"] == null || importedClips["Walk"] == null)
                    throw new InvalidOperationException("The packaged character has no Idle/Walk clips.");
                importedClips.playAutomatically = false;
                importedClips.Stop();
                importedClips.cullingType = AnimationCullingType.AlwaysAnimate;
                ApplyCharacterMaterials(candidate);
                importedModel = candidate;
                importedResources = resources;
                clips = importedClips;
                HasImportedModel = true;
                candidate = null;
                resources = null;
                importedModel.SetActive(true);
                if (fallback) { fallback.SetActive(false); Destroy(fallback); }
                fallback = null;
                fallbackRig = null;
                if (zeroReaction || reducedMotion) FreezeIdle();
                else if (reactionUntil > Time.unscaledTime && reactionClip != null) PlayClip(reactionClip, false);
                else PlayLocomotion();
            }
            catch (OperationCanceledException) { }
            catch (Exception error)
            {
                if (this && requestGeneration == generation && !cancellation.IsCancellationRequested)
                    Debug.LogWarning("Crazy Rich character " + id + " uses the chibi fallback: " + error.Message, this);
            }
            finally
            {
                // Pending imports retain ownership until their awaits finish. Scene exit
                // cancels first, so native meshes are never disposed during import work.
                if (candidate) { candidate.SetActive(false); Destroy(candidate); }
                resources?.Dispose();
            }
        }

        private static void NormalizeBounds(Transform model)
        {
            var renderers = model.GetComponentsInChildren<Renderer>(true);
            if (renderers.Length == 0) throw new InvalidOperationException("The character has no renderable mesh.");
            var bounds = new Bounds();
            var first = true;
            foreach (var renderer in renderers)
            {
                var local = renderer.localBounds;
                for (var corner = 0; corner < 8; corner++)
                {
                    var point = local.center + Vector3.Scale(local.extents, new Vector3((corner & 1) == 0 ? -1 : 1, (corner & 2) == 0 ? -1 : 1, (corner & 4) == 0 ? -1 : 1));
                    point = model.InverseTransformPoint(renderer.transform.TransformPoint(point));
                    if (first) { bounds = new Bounds(point, Vector3.zero); first = false; }
                    else bounds.Encapsulate(point);
                }
                if (renderer is SkinnedMeshRenderer skin) skin.updateWhenOffscreen = false;
            }
            if (!float.IsFinite(bounds.size.y) || bounds.size.y < .01f)
                throw new InvalidOperationException("The character bounds are invalid.");
            var scale = DisplayHeight / bounds.size.y;
            model.localScale = Vector3.one * scale;
            model.localPosition = new Vector3(-bounds.center.x * scale, .02f - bounds.min.y * scale, -bounds.center.z * scale);
        }

        private void ApplyCharacterMaterials(GameObject model)
        {
            var copies = new Dictionary<Material, Material>();
            foreach (var renderer in model.GetComponentsInChildren<Renderer>(true))
            {
                var source = renderer.sharedMaterials;
                for (var i = 0; i < source.Length; i++)
                {
                    if (!source[i] || !source[i].shader || !source[i].shader.isSupported)
                        throw new InvalidOperationException("The character shader is unavailable in this build.");
                    if (!copies.TryGetValue(source[i], out var material))
                    {
                        // Keep glTF vertex colors, but give chibi skin/hair a matte finish.
                        // Never mutate glTFast's shared default material.
                        material = new Material(source[i]) { name = "CRWT_" + CharacterId + "_Matte" };
                        if (material.HasProperty("metallicFactor")) material.SetFloat("metallicFactor", 0);
                        if (material.HasProperty("roughnessFactor")) material.SetFloat("roughnessFactor", .72f);
                        copies.Add(source[i], material);
                        ownedMaterials.Add(material);
                    }
                    source[i] = material;
                }
                renderer.sharedMaterials = source;
            }
        }

        // Android returns jar:file://...!/assets; desktop paths need file:// URI encoding.
        public static string StreamingAssetUrl(string characterId)
        {
            var path = Application.streamingAssetsPath.Replace('\\', '/').TrimEnd('/') + "/Characters/" + NormalizeCharacterId(characterId) + ".glb";
            return path.Contains("://") ? path : new Uri(path).AbsoluteUri;
        }

        public static string NormalizeCharacterId(string value)
        {
            switch ((value ?? string.Empty).Trim().ToLowerInvariant())
            {
                case "alexia": return "alexia";
                case "rindi": return "rindi";
                case "kairo": return "kairo";
                case "luna": return "luna";
                case "nox": return "nox";
                case "atlas": return "atlas";
                default: return "alexia";
            }
        }

        private void OnEnable()
        {
            if (clips) PlayLocomotion();
        }

        private void OnDisable()
        {
            if (clips) clips.Stop();
            playingClip = null;
        }

        private void ClearVisual()
        {
            generation++;
            if (loading != null) { loading.Cancel(); loading.Dispose(); loading = null; }
            if (clips) clips.Stop();
            clips = null;
            playingClip = null;
            if (facing) { facing.gameObject.SetActive(false); Destroy(facing.gameObject); }
            facing = null;
            reactionPivot = null;
            importedModel = null;
            importedResources?.Dispose();
            importedResources = null;
            foreach (var material in ownedMaterials) if (material) Destroy(material);
            ownedMaterials.Clear();
            HasImportedModel = false;
            fallback = null;
            fallbackRig = null;
            zeroReaction = false;
            reactionClip = null;
            reactionUntil = 0;
        }

        private void OnDestroy() { ClearVisual(); }
    }
}
