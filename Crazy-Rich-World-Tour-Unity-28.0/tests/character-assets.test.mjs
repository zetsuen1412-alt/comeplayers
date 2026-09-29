import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(project, 'Assets', 'StreamingAssets', 'Characters');
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
const expectedClips = ['Idle', 'Walk', 'Jump', 'Skill', 'Win', 'Lose'];

function glb(file) {
  const buffer = fs.readFileSync(file);
  assert.equal(buffer.toString('ascii', 0, 4), 'glTF');
  assert.equal(buffer.readUInt32LE(4), 2);
  assert.equal(buffer.readUInt32LE(8), buffer.length);
  const jsonLength = buffer.readUInt32LE(12);
  assert.equal(buffer.readUInt32LE(16), 0x4e4f534a);
  const json = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength));
  const binaryOffset = 20 + jsonLength;
  assert.equal(buffer.readUInt32LE(binaryOffset + 4), 0x004e4942);
  const binaryLength = buffer.readUInt32LE(binaryOffset);
  assert.ok(binaryOffset + 8 + binaryLength <= buffer.length);
  return { json, binary: buffer.subarray(binaryOffset + 8, binaryOffset + 8 + binaryLength) };
}

function floats(asset, accessorId) {
  const accessor = asset.json.accessors[accessorId];
  assert.equal(accessor.componentType, 5126, 'animation data must use float32');
  const view = asset.json.bufferViews[accessor.bufferView];
  assert.equal(view.buffer, 0, 'self-contained GLB');
  const width = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type];
  assert.ok(width);
  const stride = view.byteStride ?? width * 4;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  assert.ok(start + (accessor.count - 1) * stride + width * 4 <= asset.binary.length);
  const result = [];
  for (let i = 0; i < accessor.count; i++) {
    const item = [];
    for (let j = 0; j < width; j++) {
      const value = asset.binary.readFloatLE(start + i * stride + j * 4);
      assert.ok(Number.isFinite(value));
      item.push(value);
    }
    result.push(item);
  }
  return result;
}

for (const [id, entry] of Object.entries(manifest.characters)) {
  test(`${id}: packaged rig, visible mesh and six usable animation clips`, () => {
    const location = path.resolve(directory, entry.file);
    assert.equal(path.dirname(location), directory, 'manifest resolves an existing packaged character');
    const asset = glb(location);
    const { json } = asset;
    assert.equal(json.asset.version, '2.0');
    assert.ok(json.scenes[json.scene].nodes.length);
    assert.ok(json.buffers.every(buffer => !buffer.uri), 'no external runtime network dependency');
    const sceneRoots = new Set(json.scenes[json.scene].nodes);
    assert.ok(json.skins.length);
    for (const skin of json.skins) {
      assert.ok(skin.joints.length >= 7);
      for (const joint of skin.joints) assert.ok(json.nodes[joint]);
    }
    for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
      for (const attribute of ['POSITION', 'COLOR_0', 'JOINTS_0', 'WEIGHTS_0'])
        assert.ok(json.accessors[primitive.attributes[attribute]], `missing ${attribute}`);
      const position = json.accessors[primitive.attributes.POSITION];
      assert.ok(position.max[1] > position.min[1]);
    }
    assert.deepEqual(json.animations.map(animation => animation.name).sort(), [...expectedClips].sort());
    assert.deepEqual(Object.values(entry.clips).sort(), [...expectedClips].sort());
    for (const animation of json.animations) {
      assert.ok(animation.channels.length > 0);
      for (const channel of animation.channels) {
        assert.ok(!sceneRoots.has(channel.target.node), `${animation.name} must not move the pawn's imported root`);
        assert.ok(json.nodes[channel.target.node]);
        const sampler = animation.samplers[channel.sampler];
        const times = floats(asset, sampler.input).map(values => values[0]);
        const values = floats(asset, sampler.output);
        assert.ok(times.length >= 2);
        assert.equal(times.length, values.length);
        assert.ok(times[0] >= 0 && times.at(-1) > 0);
        for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1]);
        if (channel.target.path === 'rotation') for (const rotation of values)
          assert.ok(Math.abs(Math.hypot(...rotation) - 1) < .001, 'rotation is a normalized quaternion');
      }
    }
  });
}
