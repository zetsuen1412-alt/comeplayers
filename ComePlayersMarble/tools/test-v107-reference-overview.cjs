'use strict';
const fs = require('fs');
const path = require('path');
function assert(c,m){ if(!c) throw new Error(m); }
const root = path.resolve(__dirname, '..');
const preset = fs.readFileSync(path.join(root,'assets/scripts/camera/ClassicComfortCameraPreset.ts'),'utf8');
const profiles = fs.readFileSync(path.join(root,'assets/scripts/camera/CameraPresentationTypes.ts'),'utf8');
const board = fs.readFileSync(path.join(root,'assets/scripts/camera/BoardCameraController.ts'),'utf8');
const hud = fs.readFileSync(path.join(root,'assets/scripts/ui/MatchHUD.ts'),'utf8');
assert(preset.includes('CLASSIC_COMFORT_CAMERA_FOV = 33'),'V107 FOV tuning missing');
assert(preset.includes('OVERVIEW_POSITION = Object.freeze({ x: 20.25, y: 25.6, z: 20.25 })'),'V107 overview position missing');
assert(preset.includes('const targetBias = Math.max(0.08, bias);'),'V107 target bias floor missing');
assert(profiles.includes("[CameraState.BoardOverview]: { duration: 0.42"),'V107 board overview profile missing');
assert(board.includes('classicTargetPose(position, 0.14, 0)'),'V107 turn focus bias missing');
assert(board.includes('classicTargetPose(destination, 0.12, 0)'),'V107 movement focus bias missing');
assert(board.includes('classicTargetPose(position, 0.18, -0.16)'),'V107 property focus bias missing');
assert(hud.includes('V107'),'V107 HUD marker missing');
console.log('V107 Reference Overview checks passed.');
