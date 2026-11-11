const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runConfigure, normalizeConfig } = require('../scripts/configure.cjs');

function fixture(t, config) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yatm-locations-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const configPath = path.join(directory, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config));
  return {
    configPath,
    read: () => JSON.parse(fs.readFileSync(configPath, 'utf8')),
    run: (answers, options = {}) => {
      let index = 0;
      const result = runConfigure({ configPath, interactive: true, log: () => {},
        ask: prompt => {
          assert.ok(index < answers.length, `Unexpected prompt: ${prompt}`);
          return answers[index++];
        }, ...options });
      assert.equal(index, answers.length);
      return result;
    },
  };
}
const base = () => ({
  interval: 10000, wait: 5000, qr: { mode: 'terminal' },
  lat: 30, lon: 114,
  locations: [{ name: 'A', lat: 30, lon: 114 }, { name: 'B', lat: 31, lon: 115 }],
  selectedLocation: 'A',
});

test('startup selection updates the coordinates used by signIn and persists the choice', t => {
  const f = fixture(t, base());
  f.run(['99', '2']);
  const result = f.read();
  assert.equal(result.selectedLocation, 'B');
  assert.equal(result.lat, 31);
  assert.equal(result.lon, 115);
  assert.deepEqual(result.qr, { mode: 'terminal' });
  assert.equal(result.interval, 10000);
  assert.equal(f.run(['']).selectedLocation, 'B');
  assert.equal(fs.statSync(f.configPath).mode & 0o777, 0o600);
});

test('legacy single coordinates migrate without losing settings', t => {
  const f = fixture(t, { lat: 0, lon: 0, wait: 5000, custom: 'preserve' });
  f.run(['']);
  assert.deepEqual(f.read().locations, [{ name: '原有定位', lat: 0, lon: 0 }]);
  assert.equal(f.read().custom, 'preserve');
});

test('management rejects duplicate names and invalid coordinates, and supports rename and removal', t => {
  const f = fixture(t, base());
  f.run([
    '1', 'A', 'C', '', 'NaN', '91', '32', '181', '116',
    '2', '3', 'C revised', '', '117',
    '3', '1',
    '4', '2',
    '0',
  ], { edit: true });
  const result = f.read();
  assert.deepEqual(result.locations, [{ name: 'B', lat: 31, lon: 115 }, { name: 'C revised', lat: 32, lon: 117 }]);
  assert.equal(result.selectedLocation, 'C revised');
  assert.equal(result.lat, 32);
  assert.equal(result.lon, 117);
});

test('startup can create its first preset and can enter management before choosing', t => {
  const f = fixture(t, { interval: 10000, lat: null, lon: null });
  f.run(['First', '30', '114', 'm', '1', 'Second', '31', '115', '0', '1']);
  assert.equal(f.read().locations.length, 2);
  assert.equal(f.read().selectedLocation, 'First');
});

test('cancel does not change configuration or continue to signin', t => {
  const initial = base();
  const f = fixture(t, initial);
  assert.equal(f.run(['q']), null);
  assert.deepEqual(f.read(), initial);
});

test('noninteractive selection is explicit or reuses the saved choice; unknown names leave config intact', t => {
  const f = fixture(t, base());
  f.run([], { interactive: false, requestedLocation: 'B' });
  assert.equal(f.run([], { interactive: false }).selectedLocation, 'B');
  const before = f.read();
  assert.throws(() => f.run([], { interactive: false, requestedLocation: 'Missing' }), /找不到/);
  assert.deepEqual(f.read(), before);
});

test('malformed preset files fail instead of silently selecting a different location', () => {
  assert.throws(() => normalizeConfig({ ...base(), selectedLocation: 'Missing' }), /不存在/);
  assert.throws(() => normalizeConfig({ locations: [{ name: 'A', lat: null, lon: 114 }] }), /有效纬度/);
  assert.throws(() => normalizeConfig({ locations: [{ name: 'A', lat: 30, lon: 114 }, { name: ' A ', lat: 31, lon: 115 }] }), /重复/);
});
