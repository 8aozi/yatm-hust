const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { createTerminalInput } = require('../dist/terminal.js');
const { SessionControl, pause } = require('../dist/control.js');
const id = 'c'.repeat(32);

function terminalFixture(t, handle = () => {}) {
  const input = new PassThrough();
  input.isTTY = true;
  const output = new PassThrough();
  const commands = [];
  const terminal = createTerminalInput(command => { commands.push(command); handle(command); }, input, output);
  t.after(() => { terminal.close(); input.destroy(); output.destroy(); });
  return { input, terminal, commands };
}

test('URL or bare ID pasted into the terminal is accepted without switching modes', t => {
  const { input, commands } = terminalFixture(t);
  const url = `https://v18.teachermate.cn/wechat-pro-ssr/student/sign?openid=${id}`;
  input.write(`${url}\n`);
  input.write(`${id}\n`);
  assert.deepEqual(commands, [{ type: 'credential', value: url }, { type: 'credential', value: id }]);
});

test('terminal commands work alongside paste and ordinary text does not replace credentials', t => {
  const { input, commands } = terminalFixture(t);
  const original = console.log;
  const lines = [];
  console.log = text => lines.push(text);
  try {
    input.write('not a URL\n');
    input.write('constructor\n');
    input.write('r\n');
    input.write('Q\n');
  } finally { console.log = original; }
  assert.deepEqual(commands, ['reset', 'quit']);
  assert.ok(lines.every(text => text.includes('当前会话保持不变')));
});

test('paste also completes the existing pending paste prompt', async t => {
  const { input, terminal } = terminalFixture(t);
  const result = terminal.readCredential();
  input.write(`${id}\n`);
  assert.equal(await result, id);
});

test('R cancels a pending credential prompt and returns to paste input', async t => {
  const control = new SessionControl();
  const { input, terminal } = terminalFixture(t, command => control.request(command));
  const result = terminal.readCredential(control.signal);
  input.write('r\n');
  await assert.rejects(result, e => e.name === 'InputInterrupted');
  assert.equal(control.consume(), 'reset');
  assert.equal(control.signal.aborted, false);
});

test('runtime commands interrupt waits immediately and latest command wins', async () => {
  const control = new SessionControl();
  const oldSignal = control.signal;
  const waiting = pause(60000, oldSignal);
  control.request('reset');
  control.request({ type: 'credential', value: id });
  await assert.rejects(waiting, e => e.name === 'InputInterrupted');
  assert.deepEqual(control.consume(), { type: 'credential', value: id });
  assert.equal(oldSignal.aborted, true);
  assert.equal(control.signal.aborted, false);
});

test('pasting alone waits until Enter before submitting credentials', async t => {
  const { input, terminal, commands } = terminalFixture(t);
  let resolved = false;
  const result = terminal.readCredential().then(value => { resolved = true; return value; });
  input.write(id);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(resolved, false);
  assert.deepEqual(commands, []);
  input.write('\n');
  assert.equal(await result, id);
});

test('noninteractive startup reports how to open an interactive terminal', async () => {
  const terminal = createTerminalInput(() => {}, new PassThrough(), new PassThrough());
  await assert.rejects(terminal.readCredential(), error => error.kind === 'action' &&
    error.actions.includes('在终端重新打开程序') && !error.actions.some(text => text.includes('自动剪贴板')));
  terminal.close();
});
