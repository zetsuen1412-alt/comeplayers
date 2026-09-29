import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import React from 'react';
import * as JsxRuntime from 'react/jsx-runtime';
import Renderer, { act } from 'react-test-renderer';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

for (const media of ['audio', 'video']) test(`a connected Android ${media} call stays connected when its media view mounts`, async () => {
  const rooms = [];
  const RoomContext = React.createContext(null);
  class Room {
    constructor() {
      this.state = 'disconnected';
      this.disconnects = 0;
      this.handlers = new Map();
      this.localParticipant = { publishTrack: async () => ({ trackSid: 'microphone' }) };
      rooms.push(this);
    }
    on(event, handler) { this.handlers.set(event, handler); return this; }
    async connect() { this.state = 'connected'; }
    async disconnect() {
      this.disconnects++;
      this.state = 'disconnected';
      this.handlers.get('disconnected')?.();
    }
  }
  const native = Object.fromEntries(['ActivityIndicator', 'Pressable', 'Text', 'View'].map(name => [name, name]));
  native.Modal = ({ children }) => React.createElement('Modal', null, children);
  native.StyleSheet = { create: styles => styles };
  const dependencies = {
    react: React,
    'react/jsx-runtime': JsxRuntime,
    'react-native': native,
    '@expo/vector-icons/Ionicons': 'Icon',
    '@livekit/react-native': {
      AudioSession: { startAudioSession: async () => {}, stopAudioSession: async () => {}, selectAudioOutput: async () => {} },
      RoomContext,
      useTracks: () => [],
      VideoTrack: 'VideoTrack',
      isTrackReference: () => true,
      // The SDK disconnects its room when LiveKitRoom receives connect=false.
      LiveKitRoom: ({ room, connect, children }) => {
        React.useEffect(() => { if (connect === false) void room.disconnect(); }, [room, connect]);
        return React.createElement(RoomContext.Provider, { value: room }, children);
      },
    },
    'livekit-client': {
      Room,
      RoomEvent: { Disconnected: 'disconnected' },
      Track: { Source: { Microphone: 'microphone', Camera: 'camera' } },
      createLocalAudioTrack: async () => ({ mediaStreamTrack: { enabled: true }, stop() {} }),
      createLocalVideoTrack: async () => ({ mediaStreamTrack: { enabled: true }, stop() {} }),
    },
    '../components': { Avatar: 'Avatar' },
    '../secure/PrivateMediaEncryption': { PrivateMediaEncryption: class {} },
    '../secure/crypto': { unhex: value => value },
    '../theme': { colors: { background: '#000', yellow: '#ff0', text: '#fff', textMuted: '#aaa', panelStrong: '#222' } },
  };
  const file = new URL('../apps/mobile/src/screens/DirectCallScreen.tsx', import.meta.url);
  const { outputText, diagnostics } = ts.transpileModule(readFileSync(file, 'utf8'), {
    fileName: file.pathname,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  assert.equal(diagnostics?.length || 0, 0);
  const mod = { exports: {} };
  runInNewContext(outputText, {
    module: mod, exports: mod.exports, console, Error, setInterval, clearInterval,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  const props = {
    connection: { serverUrl: 'wss://livekit.example', participantToken: 'token' },
    call: { id: 'call-1', media, other: { username: 'Friend' } },
    peerId: 'friend-1',
    onLeave() {}, onRetry() {},
  };
  let view;
  await act(async () => {
    view = Renderer.create(React.createElement(mod.exports.DirectCallScreen, props));
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].state, 'connected');
  assert.equal(rooms[0].disconnects, 0);
  assert.equal(view.root.findAllByType('VideoTrack').length, 0);
  assert.equal(view.root.findAllByType('Pressable').filter(button => button.props.accessibilityRole === 'button').length, 0);
  await act(async () => view.unmount());
  assert.equal(rooms[0].disconnects, 1);
});
