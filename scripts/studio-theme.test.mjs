import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, parseTheme, serializeTheme } from '../lib/studio/theme.ts';

test('five editable presets round-trip portable embedded textures', () => {
  assert.deepEqual(PRESETS.map(t => t.id), ['day', 'white', 'blue', 'dark', 'night']);
  const theme = structuredClone(PRESETS[0]);
  theme.textures.shell = 'data:image/png;base64,aGVsbG8=';
  assert.deepEqual(parseTheme(serializeTheme(theme)), theme);
});
test('imports reject unsupported versions, transient URLs and invalid lighting', () => {
  for (const patch of [{version:2}, {lighting:{intensity:NaN}}, {textures:{shell:'javascript:alert(1)'}}, {textures:{shell:'blob:old-session'}}, {colors:{shell:'invalid'}}, {name:'x'.repeat(201)}]) {
    assert.throws(() => parseTheme(JSON.stringify({...PRESETS[0],...patch})));
  }
});
