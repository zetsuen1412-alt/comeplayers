import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import * as JsxRuntime from 'react/jsx-runtime';
import Renderer, { act } from 'react-test-renderer';
import ts from 'typescript';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = readFileSync(new URL('../apps/mobile/src/screens/ChatKeyboardLayout.tsx', import.meta.url), 'utf8');
function fixture(os = 'android', initialKeyboard) {
  let nextFrame = 0;
  let keyboard = initialKeyboard;
  const frames = new Map();
  const listeners = new Map();
  const mod = { exports: {} };
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  runInNewContext(outputText, {
    module: mod, exports: mod.exports, console,
    requestAnimationFrame: callback => { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    require(name) {
      if (name === 'react') return React;
      if (name === 'react/jsx-runtime') return JsxRuntime;
      if (name === 'react-native') return { View: 'View', Platform: { OS: os }, StyleSheet: { create: value => value }, Keyboard: {
        metrics: () => keyboard,
        addListener: (name, callback) => { listeners.set(name, callback); return { remove: () => listeners.delete(name) }; },
        scheduleLayoutAnimation() {},
      } };
      throw Error('Unexpected dependency: ' + name);
    },
  });
  return {
    ...mod.exports, frames, listeners,
    flushFrames() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); },
    keyboard(metrics) {
      keyboard = metrics;
      listeners.get(os === 'ios' ? metrics ? 'keyboardWillShow' : 'keyboardWillHide' : metrics ? 'keyboardDidShow' : 'keyboardDidHide')?.({ endCoordinates: metrics, duration: 0 });
    },
  };
}
async function mount(t, component, options) {
  let view;
  await act(async () => { view = Renderer.create(component, options); });
  t.after(async () => { await act(async () => view.unmount()); });
  return view;
}
async function mountAnchor(t, os = 'android') {
  const f = fixture(os);
  let current;
  const scrolls = [];
  function Chat({ id = 'room-1', unfiltered = true }) {
    current = f.useChatScrollAnchor(id, unfiltered);
    return React.createElement('List', current.listProps);
  }
  const view = await mount(t, React.createElement(Chat), { createNodeMock: () => ({ scrollToOffset: options => scrolls.push(options) }) });
  return { ...f, view, Chat, scrolls, props: () => current.listProps, latest: () => current.scrollToLatest() };
}

for (const os of ['android', 'ios']) test(`${os}: avoid only the measured keyboard overlap, including safe area and rotation`, async t => {
  const f = fixture(os);
  let origin = 30;
  let height = 800;
  const view = await mount(t, React.createElement(f.ChatKeyboardLayout, null, React.createElement('Messages'), React.createElement('Composer')), {
    createNodeMock: node => node.type === 'View' && node.props.onLayout ? { measureInWindow: callback => callback(0, origin, 390, height) } : null,
  });
  const [wrapper, content] = view.root.findAllByType('View');
  const padding = () => content.props.style[1].paddingBottom;
  await act(async () => wrapper.props.onLayout());
  assert.equal(padding(), 0);
  await act(async () => f.keyboard({ screenY: 530, height: 300 }));
  assert.equal(padding(), 300, 'edge-to-edge content is lifted above the keyboard');
  assert.equal(content.findAllByType('Messages').length, 1);
  assert.equal(content.findAllByType('Composer').length, 1);
  height = 500; // adjustResize has already consumed the entire keyboard area.
  await act(async () => wrapper.props.onLayout());
  assert.equal(padding(), 0, 'native resize must not apply keyboard avoidance twice');
  height = 800;
  await act(async () => wrapper.props.onLayout());
  await act(async () => f.keyboard({ screenY: 450, height: 380 }));
  assert.equal(padding(), 380, 'emoji panel height changes update avoidance');
  origin = 0; height = 400;
  await act(async () => { wrapper.props.onLayout(); f.keyboard({ screenY: 250, height: 150 }); });
  assert.equal(padding(), 150, 'rotation uses current geometry, not an initial height');
  origin = 15;
  await act(async () => wrapper.props.onLayout());
  assert.equal(padding(), 165, 'safe-area changes recalculate even without another keyboard event');
  await act(async () => f.keyboard(undefined));
  assert.equal(padding(), 0);
  await act(async () => view.unmount());
  assert.equal(f.listeners.size, 0);
});

test('a chat opened while the keyboard is already visible immediately reserves its overlap', async t => {
  const f = fixture('android', { screenY: 500, height: 300 });
  const view = await mount(t, React.createElement(f.ChatKeyboardLayout, null, React.createElement('Composer')), {
    createNodeMock: node => node.type === 'View' && node.props.onLayout ? { measureInWindow: callback => callback(0, 24, 390, 752) } : null,
  });
  const [wrapper, content] = view.root.findAllByType('View');
  await act(async () => wrapper.props.onLayout());
  assert.equal(content.props.style[1].paddingBottom, 276);
});

test('keyboard and multiline composer resizing keep the newest message visible', async t => {
  const f = await mountAnchor(t);
  f.props().onScroll({ nativeEvent: { contentOffset: { y: 12 } } });
  f.props().onLayout();
  f.props().onContentSizeChange();
  assert.equal(f.frames.size, 1, 'layout updates share one animation frame');
  f.flushFrames();
  assert.equal(f.scrolls.length, 1);
  assert.equal(f.scrolls[0].offset, 0);
  assert.equal(f.props().keyboardShouldPersistTaps, 'handled');
});

test('incoming messages, media sizing and keyboard opening never jump away from older history', async t => {
  const f = await mountAnchor(t);
  f.props().onScroll({ nativeEvent: { contentOffset: { y: 420 } } });
  f.props().onLayout();
  f.props().onContentSizeChange();
  f.flushFrames();
  assert.equal(f.scrolls.length, 0);
  assert.equal(f.props().maintainVisibleContentPosition.minIndexForVisible, 0);
  f.latest(); // An explicit send returns to the newest message.
  f.flushFrames();
  assert.equal(f.scrolls.length, 1);
  assert.equal(f.scrolls[0].offset, 0);
});

test('a user drag cancels a queued automatic scroll', async t => {
  const f = await mountAnchor(t);
  f.props().onLayout();
  assert.equal(f.frames.size, 1);
  f.props().onScrollBeginDrag();
  f.flushFrames();
  assert.equal(f.scrolls.length, 0);
});

test('filtering disables native position anchoring and leaving chat cancels queued work', async t => {
  const f = await mountAnchor(t, 'ios');
  await act(async () => f.view.update(React.createElement(f.Chat, { unfiltered: false })));
  assert.equal(f.props().maintainVisibleContentPosition, undefined);
  assert.equal(f.props().keyboardDismissMode, 'interactive');
  f.props().onLayout();
  await act(async () => f.view.unmount());
  assert.equal(f.frames.size, 0);
});

test('iOS keyboard frame changes resize the composer without requiring another show event', async t => {
  const f = fixture('ios', { screenY: 550, height: 250 });
  const view = await mount(t, React.createElement(f.ChatKeyboardLayout, null, React.createElement('Composer')), {
    createNodeMock: node => node.type === 'View' && node.props.onLayout ? { measureInWindow: callback => callback(0, 20, 390, 780) } : null,
  });
  const [wrapper, content] = view.root.findAllByType('View');
  await act(async () => wrapper.props.onLayout());
  assert.equal(content.props.style[1].paddingBottom, 250);
  const changed = f.listeners.get('keyboardWillChangeFrame');
  assert.equal(typeof changed, 'function');
  await act(async () => changed({ endCoordinates: { screenY: 420, height: 380 }, duration: 200 }));
  assert.equal(content.props.style[1].paddingBottom, 380, 'expanded emoji/dictation keyboard cannot cover the composer');
  await act(async () => changed({ endCoordinates: { screenY: 800, height: 0 }, duration: 200 }));
  assert.equal(content.props.style[1].paddingBottom, 0, 'dismissed keyboard leaves no extra bottom space');
});
