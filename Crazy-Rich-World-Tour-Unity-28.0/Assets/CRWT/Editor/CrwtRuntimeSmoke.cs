#if UNITY_EDITOR
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace ComePlayers.CrazyRich.Editor
{
    // Editor-only integration fixtures. Nothing here ships in a player, calls an
    // RPC, generates gameplay RNG, or changes the production client's demo mode.
    [InitializeOnLoad]
    internal static class CrwtRuntimeSmoke
    {
        private const string ActiveKey = "CRWT.Smoke.Active";
        private const string StartedKey = "CRWT.Smoke.Started";
        private const string FinishedKey = "CRWT.Smoke.Finished";
        private const string SuccessKey = "CRWT.Smoke.Success";
        private const string ScenesKey = "CRWT.Smoke.Scenes";
        private const string PreferencesKey = "CRWT.Smoke.Preferences";
        private static readonly string[] Preferences = { "CRWT_ReducedMotion", "CRWT_Mute", "CRWT_LowPower" };
        private static readonly string[] Characters = { "alexia", "rindi", "kairo", "luna", "nox", "atlas" };
        private static readonly Stack<IEnumerator> Work = new Stack<IEnumerator>();
        private static readonly List<string> Checks = new List<string>();
        private static readonly List<string> Errors = new List<string>();
        private static readonly List<string> Warnings = new List<string>();
        private static readonly HashSet<string> DiceStates = new HashSet<string>();
        private static CrwtMatchController controller;
        private static CrwtBoardView board;
        private static CrwtDicePresenter dice;
        private static bool capturedSession, savedGuest, finishing, capturedBoard, capturedHud;
        private static string savedMatch, savedMap, savedName;
        private static double startedAt;
        private static int steps, reveals, lastFrame = -1;

        static CrwtRuntimeSmoke()
        {
            EditorApplication.playModeStateChanged += ModeChanged;
            EditorApplication.update += Tick;
        }

        internal static void Run()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode || SessionState.GetBool(ActiveKey,false))
                throw new InvalidOperationException("Stop Play Mode before starting the isolated smoke test.");
            for (int i = 0; i < SceneManager.sceneCount; i++)
                if (SceneManager.GetSceneAt(i).isDirty)
                    throw new InvalidOperationException("Save open scenes before the smoke test; no unsaved scene will be closed.");
            CrwtProjectSetup.Ensure();
            var scenes = EditorSceneManager.GetSceneManagerSetup();
            SessionState.SetString(ScenesKey, JsonUtility.ToJson(new SavedScenes
            {
                scenes = scenes.Where(s => !string.IsNullOrEmpty(s.path))
                    .Select(s => new SavedScene { path = s.path, loaded = s.isLoaded, active = s.isActive }).ToArray()
            }));
            SessionState.SetBool(ActiveKey,true);
            SessionState.SetBool(StartedKey,false);
            SessionState.SetBool(FinishedKey,false);
            SessionState.SetBool(SuccessKey,false);
            // All original scenes are saved; the temporary scene contains no scripts
            // until after Play Mode starts, so neither Auth nor Supabase is constructed.
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            EditorApplication.EnterPlaymode();
        }

        private static void ModeChanged(PlayModeStateChange change)
        {
            if (!SessionState.GetBool(ActiveKey,false)) return;
            if (change == PlayModeStateChange.EnteredPlayMode) BeginRuntime();
            else if (change == PlayModeStateChange.ExitingPlayMode && !SessionState.GetBool(FinishedKey,false))
                Finish(false,"Play Mode was stopped before the smoke test completed.",false);
            else if (change == PlayModeStateChange.EnteredEditMode) RestoreEditor();
        }

        private static void BeginRuntime()
        {
            if (SessionState.GetBool(StartedKey,false)) return;
            SessionState.SetBool(StartedKey,true);
            Work.Clear(); Checks.Clear(); Errors.Clear(); Warnings.Clear(); DiceStates.Clear();
            startedAt = EditorApplication.timeSinceStartup;
            capturedSession = true;
            savedGuest = CrwtSession.IsGuest; savedMatch = CrwtSession.MatchId;
            savedMap = CrwtSession.SelectedMapId; savedName = CrwtSession.DisplayName;
            SessionState.SetString(PreferencesKey,JsonUtility.ToJson(new SavedPreferences
            {
                values=Preferences.Select(key=>new SavedPreference { key=key,exists=PlayerPrefs.HasKey(key),value=PlayerPrefs.GetInt(key) }).ToArray()
            }));
            PlayerPrefs.SetInt("CRWT_ReducedMotion",0);
            PlayerPrefs.SetInt("CRWT_Mute",1);
            PlayerPrefs.SetInt("CRWT_LowPower",0);
            Application.logMessageReceived += CaptureLog;
            steps = 0; reveals = 0; lastFrame = -1; capturedBoard = false; capturedHud = false;
            Work.Push(ExerciseRuntime());
        }

        private static void Tick()
        {
            if (!SessionState.GetBool(ActiveKey,false)) return;
            if (SessionState.GetBool(FinishedKey,false))
            {
                if (!EditorApplication.isPlayingOrWillChangePlaymode) RestoreEditor();
                return;
            }
            if (!EditorApplication.isPlaying) return;
            if (!SessionState.GetBool(StartedKey,false)) BeginRuntime();
            try
            {
                if (Errors.Count > 0) throw new InvalidOperationException(Errors[0]);
                if (EditorApplication.timeSinceStartup - startedAt > 120)
                    throw new TimeoutException("Runtime smoke exceeded 120 seconds.");
                // Editor updates can outnumber game frames; a yielded null must
                // allow Start, animation sampling and deferred Destroy to advance.
                if (Time.frameCount == lastFrame) return;
                lastFrame = Time.frameCount;
                if (dice) DiceStates.Add(dice.State.ToString());
                if (Work.Count == 0) throw new InvalidOperationException("A domain reload interrupted the runtime smoke.");
                var current = Work.Peek();
                if (!current.MoveNext())
                {
                    Work.Pop();
                    if (Work.Count == 0) Finish(true,"");
                }
                else if (current.Current is IEnumerator nested) Work.Push(nested);
            }
            catch (Exception ex) { Finish(false,ex.GetBaseException().Message); }
        }

        private static IEnumerator ExerciseRuntime()
        {
            Require(SystemInfo.graphicsDeviceType != GraphicsDeviceType.Null,"PlayMode smoke requires a graphics device; omit -nographics.");
            CrwtSession.IsGuest = true; CrwtSession.MatchId = null;
            CrwtSession.SelectedMapId = "world_tour"; CrwtSession.DisplayName = "Smoke Fixture";
            controller = new GameObject("CRWT_EditorOnly_Smoke").AddComponent<CrwtMatchController>();
            yield return Until(() => Object.FindFirstObjectByType<CrwtBoardView>() && controller.GetComponent<CrwtDicePresenter>(),10,"Match UI initialization");
            // Start() initialized the actual match UI in guest mode. Disable polling
            // before injecting fixtures, and never create CrwtAppRoot or an API client.
            controller.enabled = false; CrwtSession.IsGuest = false;
            board = Object.FindFirstObjectByType<CrwtBoardView>();
            dice = controller.GetComponent<CrwtDicePresenter>();
            board.StepFinished += () => steps++;
            dice.Revealed += _ => reveals++;
            Require(!Object.FindFirstObjectByType<CrwtAppRoot>(),"Unexpected network application root in isolated scene.");
            Require(EventSystem.current && EventSystem.current.GetComponent<StandaloneInputModule>(),"Missing pointer/touch event module.");
            Require(GameObject.Find("MatchUI") && controller.GetComponent<CrwtActionSheet>(),"Missing match canvas or action sheet.");
            Require(Object.FindFirstObjectByType<CrwtSafeArea>(),"Missing safe-area layout component.");
            Require(Object.FindObjectsByType<CrwtStarDieGraphic>(FindObjectsSortMode.None).Length == 2,"Exactly two Starwheel dice are required.");
            foreach (var label in Object.FindObjectsByType<Text>(FindObjectsSortMode.None)) Require(label.font,"Missing runtime UI font.");
            foreach (string resource in new[] { "CRWT/Art/portraits-alexia-rindi", "CRWT/Art/world-tour-lobby" })
            {
                var texture = Resources.Load<Texture2D>(resource);
                Require(texture && texture.width <= 2048 && texture.height <= 2048,"Missing or oversized UI art: " + resource);
            }
            Checks.Add("Actual match UI initialized without Auth/RPC; both dice, fonts, safe area and art loaded.");
            Accept(Snapshot(100,null,0));
            yield return Until(() => !board.IsMoving,5,"Initial snapshot reconciliation");
            InvokeController("UpdateDeadline");
            Canvas.ForceUpdateCanvases();
            ValidateTurnHudGeometry();
            yield return CaptureHud();
            Checks.Add("Turn HUD geometry passed: circular ROLL, server countdown banner, safe-area containment and no primary overlap.");
            yield return Until(() => board.GetComponentsInChildren<CrwtCharacterView>().Length == 6
                && board.GetComponentsInChildren<CrwtCharacterView>().All(c => c.HasImportedModel),30,"All six packaged GLB characters must import; a fallback does not pass this test");
            foreach (var character in board.GetComponentsInChildren<CrwtCharacterView>())
            {
                var animation = character.GetComponentInChildren<Animation>();
                Require(animation,"Missing legacy animation component for " + character.CharacterId);
                foreach (string clip in new[] { "Idle", "Walk", "Jump", "Skill", "Win", "Lose" })
                    Require(animation[clip] != null && animation[clip].length > 0,"Missing animation " + character.CharacterId + "/" + clip);
                Require(animation.IsPlaying("Idle"),"Idle animation did not start for " + character.CharacterId);
            }
            foreach (var renderer in board.GetComponentsInChildren<Renderer>())
                foreach (var material in renderer.sharedMaterials)
                    Require(material && material.shader && material.shader.isSupported,"Missing/unsupported runtime material on " + renderer.name);
            var tiles = board.GetComponentsInChildren<Transform>().Where(t => t.name.StartsWith("Tile_",StringComparison.Ordinal)).ToArray();
            Require(tiles.Length == 32 && tiles.Select(t => t.localPosition).Distinct().Count() == 32,"Rendered tile roots overlap or are missing.");
            Checks.Add("Six real GLBs imported with Idle/Walk/Jump/Skill/Win/Lose; board shaders and 32 unique tiles valid.");

            var pawn = board.transform.Find("Pawn_Seat_1");
            var zeroPosition = pawn.position;
            dice.BeginThrow();
            yield return Until(() => dice.State == CrwtDiceAnimationState.Spin,3,"Dice spin before response");
            yield return ForSeconds(.25,() =>
            {
                Require(!dice.IsPresenting && reveals == 0,"Dice revealed without a server fixture.");
                Require(Object.FindObjectsByType<CrwtStarDieGraphic>(FindObjectsSortMode.None).All(d => d.Face == -1),"Unconfirmed dice face was shown.");
            });
            var zero = new CrwtLastRoll { roll_id="smoke-zero",seat=1,d1=0,d2=0,total=0,doubles=true,zero_roll=true,from=0,to=0,tile="start",@event="ZERO ROLL! Tetap di tempat." };
            Accept(Snapshot(101,zero,0));
            yield return Until(() => !dice.IsBusy,6,"ZERO ROLL cinematic",() =>
            {
                Require(pawn.position == zeroPosition && !board.IsMoving && steps == 0,"ZERO ROLL moved a pawn or ran a walking step.");
            });
            yield return null; // Deferred UI destruction finishes before counting controls.
            Require(reveals == 1 && DiceStates.Contains("ZeroReveal"),"ZERO ROLL did not reveal once.");
            Require(HasRollButton(),"Doubles did not restore the ROLL button after zero.");
            Checks.Add("Before response: unknown faces. ZERO ROLL: stationary on START, no walking steps, one reveal, ROLL button restored.");

            var walking = new CrwtLastRoll { roll_id="smoke-walk",seat=1,d1=0,d2=5,total=5,doubles=false,zero_roll=false,from=0,to=5,tile="city",@event="Smoke fixture" };
            Accept(Snapshot(102,walking,5));
            yield return Until(() => board.IsMoving,6,"Movement after confirmed reveal");
            var actor = pawn.GetComponent<CrwtCharacterView>();
            Require(actor.GetComponentInChildren<Animation>().IsPlaying("Walk"),"Walk clip was not started for movement.");
            yield return Until(() => !board.IsMoving && !dice.IsBusy,5,"Five tile movement");
            var expected = CrwtBoardLayout.Position(5);
            Require(steps == 5 && reveals == 2,"0+5 must reveal once and produce exactly five walking steps.");
            Require(Vector3.Distance(pawn.localPosition,new Vector3(expected.X+.24f,.125f,expected.Z-.20f)) < .001f,"Walking ended at the wrong server tile.");
            Accept(Snapshot(103,walking,5));
            yield return ForSeconds(.3,() => Require(!dice.IsBusy && !board.IsMoving && steps == 5 && reveals == 2,"Repeated snapshot replayed dice or movement."));
            Checks.Add("Confirmed 0+5 played Walk and exactly five steps; repeated snapshot did not replay.");

            board.PlaySkill(1);
            yield return null;
            Require(actor.GetComponentInChildren<Animation>().IsPlaying("Skill"),"Skill reaction did not play.");
            var sheet = controller.GetComponent<CrwtActionSheet>();
            sheet.Show("SMOKE TEST","editor-fixture"); sheet.Note("Temporary fixture UI");
            Canvas.ForceUpdateCanvases();
            Require(sheet.IsOpen && sheet.Content && sheet.Content.GetComponentInParent<ScrollRect>(),"Action sheet did not initialize its scroll view.");
            sheet.Close(); Require(!sheet.IsOpen,"Action sheet did not close.");
            dice.BeginThrow(); yield return null; dice.CancelWaiting();
            Require(!dice.IsBusy && !dice.IsPresenting,"Cancelled dice did not return to Idle.");
            CaptureBoard();
            Checks.Add("Skill, temporary action sheet and cancelled dice lifecycle passed; board rendered to PNG.");

            // Dispose a board while new imports are in flight; this catches disposed
            // glTF resources, stale callbacks and missing object lifecycle failures.
            board.Build("tokyo_rush");
            var replacement = Snapshot(104,null,0); replacement.state.map_id = "tokyo_rush";
            board.Apply(replacement);
            Object.Destroy(board.gameObject);
            Object.Destroy(controller.gameObject);
            yield return ForSeconds(1.5,null);
            Require(!board && !controller,"Board/controller did not destroy.");
            Require(!Object.FindFirstObjectByType<CrwtAppRoot>(),"Smoke created a network application root.");
            Require(new[] { "Idle","Throw","Spin","Bounce","Reveal","ZeroReveal" }.All(DiceStates.Contains),"Not all dice lifecycle states were observed.");
            Checks.Add("Board rebuild and destruction during character import completed without runtime errors.");
        }

        private static void Accept(CrwtMatchSnapshot fixture)
        {
            var method = typeof(CrwtMatchController).GetMethod("AcceptSnapshot",BindingFlags.Instance|BindingFlags.NonPublic);
            Require(method != null,"Snapshot presentation entrypoint changed; update this Editor-only test.");
            method.Invoke(controller,new object[] { fixture,true });
        }

        private static CrwtMatchSnapshot Snapshot(int version, CrwtLastRoll roll, int position)
        {
            return new CrwtMatchSnapshot
            {
                status="active",version=version,round=1,turn_seat=1,your_seat=1,
                deadline_at=DateTimeOffset.UtcNow.AddSeconds(10).ToString("O"),
                state=new CrwtMatchState
                {
                    phase="await_roll",map_id="world_tour",win_condition="bankruptcy",last_roll=roll,
                    message=roll?.@event ?? "Editor-only snapshot fixture",pending=null,
                    players=Characters.Select((id,index) => new CrwtPlayer { seat=index+1,name="Fixture "+(index+1),character_id=id,cash=2000,position=index==0?position:index*2,cards=Array.Empty<string>() }).ToArray(),
                    properties=new Dictionary<string,CrwtPropertyState>
                    {
                        ["1"]=new CrwtPropertyState { owner_seat=2,level=1 },["2"]=new CrwtPropertyState { owner_seat=2,level=2 },
                        ["4"]=new CrwtPropertyState { owner_seat=2,level=3 },["5"]=new CrwtPropertyState { owner_seat=2,level=4 }
                    }
                }
            };
        }

        private static void InvokeController(string methodName)
        {
            var method = typeof(CrwtMatchController).GetMethod(methodName,BindingFlags.Instance|BindingFlags.NonPublic);
            Require(method != null,"Match presentation method changed: " + methodName);
            method.Invoke(controller,null);
        }

        private static void ValidateTurnHudGeometry()
        {
            var safe = Object.FindFirstObjectByType<CrwtSafeArea>()?.GetComponent<RectTransform>();
            var roll = GameObject.Find("CircleButton_ROLL")?.GetComponent<RectTransform>();
            var banner = GameObject.Find("Your Turn Banner")?.GetComponent<RectTransform>();
            var top = GameObject.Find("Turn bar")?.GetComponent<RectTransform>();
            var actions = GameObject.Find("Actions")?.GetComponent<RectTransform>();
            var status = GameObject.Find("Event caption")?.GetComponent<RectTransform>();
            Require(safe && roll && banner && top && actions && status,"Turn HUD runtime objects are incomplete.");
            Require(roll.gameObject.activeInHierarchy && banner.gameObject.activeInHierarchy,"ROLL or GILIRANMU banner is hidden on local await_roll.");
            Require(Mathf.Abs(roll.rect.width-roll.rect.height) <= 1f && roll.rect.width >= 130f,"ROLL button is not a large square/circular control.");
            Require(RectContains(safe,roll,2f),"ROLL button leaves the safe area.");
            Require(RectContains(safe,banner,2f),"Turn banner leaves the safe area.");
            Require(!RectOverlap(roll,actions,2f),"ROLL overlaps the SKILL/KARTU action panel.");
            Require(!RectOverlap(roll,status,2f),"ROLL overlaps the status/event caption.");
            Require(!RectOverlap(banner,top,2f),"GILIRANMU banner overlaps the top turn bar.");
            var label = banner.GetComponentInChildren<Text>();
            Require(label && label.text.Contains("GILIRANMU") && label.text.Contains("AUTO ROLL"),"Turn banner does not show server countdown semantics.");
            Require(banner.GetComponentInChildren<RawImage>(),"Turn banner is missing the speaking character portrait.");
        }

        private static Rect WorldRect(RectTransform rect)
        {
            var corners = new Vector3[4]; rect.GetWorldCorners(corners);
            var minX = corners.Min(v=>v.x); var maxX = corners.Max(v=>v.x);
            var minY = corners.Min(v=>v.y); var maxY = corners.Max(v=>v.y);
            return Rect.MinMaxRect(minX,minY,maxX,maxY);
        }

        private static bool RectOverlap(RectTransform a, RectTransform b, float pad)
        {
            var x = WorldRect(a); var y = WorldRect(b);
            x.xMin += pad; x.xMax -= pad; x.yMin += pad; x.yMax -= pad;
            y.xMin += pad; y.xMax -= pad; y.yMin += pad; y.yMax -= pad;
            return x.Overlaps(y);
        }

        private static bool RectContains(RectTransform parent, RectTransform child, float tolerance)
        {
            var outer = WorldRect(parent); var inner = WorldRect(child);
            return inner.xMin >= outer.xMin-tolerance && inner.xMax <= outer.xMax+tolerance
                && inner.yMin >= outer.yMin-tolerance && inner.yMax <= outer.yMax+tolerance;
        }

        private static IEnumerator CaptureHud()
        {
            Directory.CreateDirectory("Logs");
            var path = Path.GetFullPath("Logs/unity-playmode-hud.png");
            if (File.Exists(path)) File.Delete(path);
            ScreenCapture.CaptureScreenshot(path,1);
            yield return Until(()=>File.Exists(path) && new FileInfo(path).Length > 1024,5,"HUD screenshot capture");
            capturedHud = true;
        }

        private static bool HasRollButton() => Object.FindObjectsByType<Button>(FindObjectsSortMode.None)
            .Any(button => button.isActiveAndEnabled && button.interactable && button.GetComponentInChildren<Text>()?.text == "ROLL");

        private static IEnumerator Until(Func<bool> ready, double seconds, string label, Action eachFrame = null)
        {
            double limit = EditorApplication.timeSinceStartup + seconds;
            while (!ready())
            {
                eachFrame?.Invoke();
                if (EditorApplication.timeSinceStartup > limit) throw new TimeoutException(label);
                yield return null;
            }
            eachFrame?.Invoke();
        }

        private static IEnumerator ForSeconds(double seconds, Action eachFrame)
        {
            double limit = EditorApplication.timeSinceStartup + seconds;
            while (EditorApplication.timeSinceStartup < limit) { eachFrame?.Invoke(); yield return null; }
        }

        private static void CaptureBoard()
        {
            var camera = Camera.main;
            Require(camera,"Missing main camera.");
            var target = RenderTexture.GetTemporary(960,540,24,RenderTextureFormat.ARGB32);
            var previousTarget = camera.targetTexture; var previousActive = RenderTexture.active;
            Texture2D image = null;
            try
            {
                camera.targetTexture = target; camera.Render(); RenderTexture.active = target;
                image = new Texture2D(960,540,TextureFormat.RGBA32,false);
                image.ReadPixels(new Rect(0,0,960,540),0,0); image.Apply();
                var colors = image.GetPixels32(); var distinct = new HashSet<int>();
                for (int i = 0; i < colors.Length; i += 97) distinct.Add((colors[i].r<<16)|(colors[i].g<<8)|colors[i].b);
                Require(distinct.Count > 16,"Offscreen board render is empty or flat.");
                Directory.CreateDirectory("Logs"); File.WriteAllBytes("Logs/unity-playmode-board.png",image.EncodeToPNG());
                capturedBoard = true;
            }
            finally
            {
                camera.targetTexture = previousTarget; RenderTexture.active = previousActive;
                if (image) Object.Destroy(image); RenderTexture.ReleaseTemporary(target);
            }
        }

        private static void CaptureLog(string message, string stack, LogType type)
        {
            if (type == LogType.Error || type == LogType.Exception || type == LogType.Assert) Errors.Add(message);
            else if (type == LogType.Warning && Warnings.Count < 20) Warnings.Add(message);
        }

        private static void Require(bool condition, string message)
        {
            if (!condition) throw new InvalidOperationException(message);
        }

        private static void Finish(bool success, string error, bool exitPlayMode = true)
        {
            if (finishing || SessionState.GetBool(FinishedKey,false)) return;
            finishing = true;
            Application.logMessageReceived -= CaptureLog;
            Work.Clear();
            RestorePreferences();
            if (capturedSession)
            {
                CrwtSession.IsGuest=savedGuest; CrwtSession.MatchId=savedMatch;
                CrwtSession.SelectedMapId=savedMap; CrwtSession.DisplayName=savedName; capturedSession=false;
            }
            Directory.CreateDirectory("Logs");
            File.WriteAllText("Logs/unity-playmode-smoke.json",JsonUtility.ToJson(new SmokeResult
            {
                success=success,unityVersion=Application.unityVersion,error=error,checks=Checks.ToArray(),
                runtimeErrors=Errors.ToArray(),warnings=Warnings.ToArray(),diceStates=DiceStates.OrderBy(s=>s).ToArray(),
                renderedBoard=capturedBoard?"Logs/unity-playmode-board.png":"",
                renderedHud=capturedHud?"Logs/unity-playmode-hud.png":"",
                device=SystemInfo.graphicsDeviceName,
                gameplayRpcClientCreated=Object.FindFirstObjectByType<CrwtAppRoot>() != null
            },true));
            CrwtBuildMenu.WriteResult("PlayMode",success,error);
            SessionState.SetBool(FinishedKey,true); SessionState.SetBool(SuccessKey,success);
            if (exitPlayMode && EditorApplication.isPlaying) EditorApplication.ExitPlaymode();
            finishing = false;
        }

        private static void RestoreEditor()
        {
            if (!SessionState.GetBool(ActiveKey,false)) return;
            bool success = SessionState.GetBool(FinishedKey,false) && SessionState.GetBool(SuccessKey,false);
            SessionState.SetBool(ActiveKey,false);
            try
            {
                RestorePreferences();
                var saved = JsonUtility.FromJson<SavedScenes>(SessionState.GetString(ScenesKey,"{}"));
                if (saved?.scenes?.Length > 0)
                    EditorSceneManager.RestoreSceneManagerSetup(saved.scenes.Select(s=>new SceneSetup { path=s.path,isLoaded=s.loaded,isActive=s.active }).ToArray());
                else EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            }
            catch (Exception ex) { success=false; Debug.LogException(ex); CrwtBuildMenu.WriteResult("PlayMode",false,"Scene restoration: "+ex.Message); }
            SessionState.EraseString(ScenesKey);
            SessionState.EraseString(PreferencesKey);
            if (Application.isBatchMode) EditorApplication.Exit(success?0:1);
            else Debug.Log("[CRWT 30] PlayMode smoke " + (success?"passed":"failed") + ". See Logs/unity-playmode-smoke.json.");
        }

        private static void RestorePreferences()
        {
            var saved=JsonUtility.FromJson<SavedPreferences>(SessionState.GetString(PreferencesKey,"{}"));
            if (saved?.values == null) return;
            foreach (var entry in saved.values)
                if (entry.exists) PlayerPrefs.SetInt(entry.key,entry.value); else PlayerPrefs.DeleteKey(entry.key);
        }

        [Serializable] private sealed class SavedPreferences { public SavedPreference[] values; }
        [Serializable] private sealed class SavedPreference { public string key; public bool exists; public int value; }
        [Serializable] private sealed class SavedScenes { public SavedScene[] scenes; }
        [Serializable] private sealed class SavedScene { public string path; public bool loaded,active; }
        [Serializable] private sealed class SmokeResult
        {
            public bool success;
            public string unityVersion,error,renderedBoard,renderedHud,device;
            public string[] checks,runtimeErrors,warnings,diceStates;
            public bool gameplayRpcClientCreated;
        }
    }
}
#endif
