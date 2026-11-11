const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const statuses = require('../dist/status.js');
const controls = require('../dist/control.js');
const { extractOpenId } = require('../dist/openid.js');
const a = 'a'.repeat(32), b = 'b'.repeat(32);
const url = id => `https://v18.teachermate.cn/wechat-pro-ssr/student/sign?openid=${id}`;

function load(file, mocks, processObject) {
  const module = { exports: {} };
  const req = name => {
    assert.ok(name in mocks, `Unexpected dependency ${name}`);
    return mocks[name];
  };
  req.main = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist', file), 'utf8'),
    { require: req, module, exports: module.exports, process: processObject,
      console: { log() {}, warn() {}, error() {} } }, { filename: file });
  return module.exports;
}

async function session({ validateSession, answers = [url(a)], onSign, onPause, onRead, env = {}, config = {} }) {
  const logs = [], errors = [], waits = [], checks = [];
  let reads = 0, submits = 0;
  let command;
  const dispatch = action => command(action);
  const processObject = { env, argv: [], platform: 'darwin', exitCode: undefined };
  const { main } = load('index.js', {
    './terminal': { createTerminalInput: handler => {
      command = handler;
      return { readCredential: async signal => {
        reads++;
        if (onRead) return onRead(reads, dispatch, signal, checks);
        assert.ok(answers.length, 'Unexpected terminal read');
        return answers.shift();
      }, close() {} };
    } },
    './control': { ...controls, pause: async (ms, signal) => {
      waits.push(ms);
      if (onPause) await onPause(ms, dispatch);
      controls.checkInterrupted(signal);
    } },
    process: { env: processObject.env },
    './requests': {
      validateSession: async (id, signal) => { checks.push(id); await validateSession(id, checks.length, dispatch, signal); },
      getStudentName: async () => '测试学生',
    },
    './consts': { config: { interval: 10000, ...config } },
    './utils': { extractOpenId, sendNotificaition: () => {}, pasteFromClipBoard: () => '', sleep: async ms => { waits.push(ms); } },
    './cdp': {},
    './sign': { signOnce: async ctx => { submits++;
      if (onSign) return onSign(ctx, submits, dispatch);
      throw new statuses.AppError('action', 'End fixture', ['测试结束']);
    } },
    './status': { ...statuses, status: (...args) => logs.push(args),
      reportError: error => { const classified = statuses.classifyError(error); errors.push(classified); return classified; } },
  }, processObject);
  await main();
  return { logs, errors, waits, checks, reads, submits };
}

test('temporary network failure retries the same openId without asking for a new URL', async () => {
  const result = await session({ validateSession: async (_, count) => {
    if (count === 1) throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
  } });
  assert.deepEqual(result.checks, [a, a]);
  assert.equal(result.reads, 1);
  assert.equal(result.errors[0].kind, 'temporary');
  assert.deepEqual(result.waits, [5000]);
  assert.ok(!result.logs.some(([state]) => ['received', 'validating'].includes(state)));
  assert.ok(result.logs.some(([state, message]) => state === 'valid' && message.includes(a) && message.includes('测试学生')));
  assert.ok(!result.logs.some(([state]) => state === 'expired'));
});

test('server-requested retry delay takes precedence over the 5-second default', async () => {
  const result = await session({ validateSession: async (_, count) => {
    if (count === 1) throw new statuses.AppError('temporary', 'rate limited', [], 30000);
  } });
  assert.deepEqual(result.waits, [30000]);
  assert.deepEqual(result.checks, [a, a]);
});

test('explicit authorization rejection discards the old openId and validates a new URL', async () => {
  const result = await session({ answers: [url(a), url(b)], validateSession: async id => {
    if (id === a) throw new statuses.AppError('auth', 'HTTP 401');
  } });
  assert.deepEqual(result.checks, [a, b]);
  assert.equal(result.reads, 2);
  assert.ok(result.logs.some(([state, message]) => state === 'expired' && message.includes(a)));
  assert.ok(result.logs.some(([state, message]) => state === 'valid' && message.includes(b)));
});

test('unrecognized server error stops with an action instead of claiming login expired', async () => {
  const result = await session({ validateSession: async () => { throw new Error('unknown server schema'); } });
  assert.equal(result.submits, 0);
  assert.equal(result.errors[0].kind, 'action');
  assert.ok(!result.logs.some(([state]) => ['valid', 'expired'].includes(state)));
});

test('pasted input errors allow re-entry and do not start requests with invalid input', async () => {
  const result = await session({ answers: ['wrong', url(a)], validateSession: async () => {} });
  assert.equal(result.reads, 2);
  assert.deepEqual(result.checks, [a]);
  assert.equal(result.errors[0].kind, 'input');
});

test('no active signin is a healthy waiting state, not an error', async () => {
  const logs = [];
  const { signOnce } = load('sign.js', {
    './requests': { activeSign: async () => [] },
    './consts': { config: { interval: 10000 } }, './QRSign': {}, './utils': {},
    './status': { status: (...args) => logs.push(args) }, './control': controls,
  }, {});
  const ctx = { openId: a, lastSignId: 42 };
  await signOnce(ctx);
  assert.equal(ctx.lastSignId, 0);
  assert.equal(logs[0][0], 'running');
  assert.match(logs[0][1], /暂无/);
});

test('failed QR subscription is caught and resets state so it can be retried', async () => {
  const failure = new statuses.AppError('temporary', 'connection reset');
  const { signOnce } = load('sign.js', {
    './requests': { activeSign: async () => [{ signId: 1, courseId: 2, name: '测试课', isQR: 1 }] },
    './consts': { config: { interval: 10000 } },
    './QRSign': { QRSign: class { start() { return Promise.reject(failure); } destory() {} } },
    './utils': { sendNotificaition() {} }, './status': { status() {} }, './control': controls,
  }, {});
  const ctx = { openId: a, lastSignId: 0, signedIdSet: new Set() };
  await signOnce(ctx);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ctx.qrError, failure);
  assert.equal(ctx.lastSignId, 0);
  assert.equal(ctx.qrSign, undefined);
});


test('direct paste replaces credentials during verification and suppresses stale results', async () => {
  let oldSignal;
  const result = await session({ validateSession: async (id, count, dispatch, signal) => {
    if (id === a) {
      oldSignal = signal;
      dispatch({ type: 'credential', value: b });
    }
  } });
  assert.ok(oldSignal.aborted);
  assert.deepEqual(result.checks, [a, b]);
  assert.equal(result.reads, 1);
  assert.equal(result.submits, 1);
  assert.ok(!result.logs.some(([state, text]) => state === 'valid' && text.includes(a)));
  assert.ok(result.logs.some(([state, text]) => state === 'valid' && text.includes(b)));
});

test('direct paste works during a network retry without waiting for another prompt', async () => {
  const result = await session({ validateSession: async id => {
    if (id === a) throw Object.assign(new Error('offline'), { code: 'ECONNRESET' });
  }, onPause: async (_, dispatch) => dispatch({ type: 'credential', value: url(b) }) });
  assert.deepEqual(result.checks, [a, b]);
  assert.equal(result.reads, 1);
});

test('R returns to terminal paste waiting and clears identity-specific state', async () => {
  const result = await session({ answers: [url(a), url(b)], validateSession: async () => {},
    onSign: async (ctx, count, dispatch) => {
      if (count === 1) {
        ctx.signedIdSet.add(123);
        dispatch('reset');
        assert.equal(ctx.openId, '');
        assert.equal(ctx.signedIdSet.size, 0);
        return;
      }
      throw new statuses.AppError('action', 'End fixture');
    },
  });
  assert.deepEqual(result.checks, [a, b]);
  assert.equal(result.reads, 2);
});

test('pasting the same openId explicitly revalidates it instead of rejecting a previously used value', async () => {
  let retained = false;
  const result = await session({ validateSession: async () => {}, onSign: async (ctx, count, dispatch) => {
    if (count === 1) {
      ctx.openIdSet.add(a);
      ctx.signedIdSet.add(123);
      dispatch({ type: 'credential', value: a });
      return;
    }
    retained = ctx.signedIdSet.has(123);
    throw new statuses.AppError('action', 'End fixture');
  } });
  assert.deepEqual(result.checks, [a, a]);
  assert.equal(result.reads, 1);
  assert.ok(retained, 'same credential must retain completed sign-ins');
});

test('each launch waits for terminal paste even with stale environment and legacy acquisition settings', async () => {
  for (let launch = 0; launch < 2; launch++) {
    let inputWaited = false;
    const result = await session({
      env: { OPEN_ID: a, YATM_CLIPBOARD: '1' },
      config: { clipboard: { paste: 'must-not-run' }, devtools: { port: 9999 } },
      onRead: async (_, dispatch, signal, checks) => {
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(checks, [], 'no network activity before explicit input');
        inputWaited = true;
        return url(b);
      },
      validateSession: async () => { assert.ok(inputWaited); },
    });
    assert.deepEqual(result.checks, [b]);
    assert.equal(result.reads, 1);
  }
});

test('direct paste interrupts the normal polling wait and validates the new credential', async () => {
  const result = await session({ validateSession: async () => {},
    onSign: async (_, count) => {
      if (count === 1) return;
      throw new statuses.AppError('action', 'End fixture');
    }, onPause: async (_, dispatch) => dispatch({ type: 'credential', value: b }),
  });
  assert.deepEqual(result.checks, [a, b]);
  assert.deepEqual(result.waits, [10000]);
  assert.equal(result.reads, 1);
});

test('a cancelled pre-submission delay does not send a sign-in request', async () => {
  const controller = new AbortController();
  let submitted = false;
  const { signOnce } = load('sign.js', {
    './requests': {
      activeSign: async () => [{ signId: 1, courseId: 2, name: '测试课', isQR: 0 }],
      signIn: async () => { submitted = true; return { errorCode: 0 }; },
    },
    './consts': { config: { wait: 5000 } }, './QRSign': {}, './utils': {},
    './status': { status() {} },
    './control': { ...controls, pause: async () => { controller.abort(); } },
  }, {});
  await assert.rejects(signOnce({ openId: a, signal: controller.signal, signedIdSet: new Set() }),
    error => error.name === 'InputInterrupted');
  assert.equal(submitted, false);
});

async function acquire(answers) {
  const logs = [];
  let reads = 0, closed = false, handler;
  // No network or clipboard dependency is supplied: any access fails this fixture.
  const { main } = load('acquire-openid.js', {
    './openid': { extractOpenId },
    './terminal': { createTerminalInput: onCommand => {
      handler = onCommand;
      return { readCredential: async signal => {
        reads++;
        assert.ok(answers.length, 'Unexpected input request');
        const answer = answers.shift();
        if (answer === 'r' || answer === 'q') {
          handler(answer === 'r' ? 'reset' : 'quit');
          controls.checkInterrupted(signal);
        }
        return answer;
      }, close() { closed = true; } };
    } },
    './control': controls,
    './status': { ...statuses, status: (...args) => logs.push(args) },
  }, { env: { OPEN_ID: b } });
  await main();
  return { reads, logs, closed };
}

test('extraction tool waits for paste, allows correction, and prints the extracted ID without network access', async () => {
  const result = await acquire(['not a URL', url(a)]);
  assert.equal(result.reads, 2);
  assert.ok(result.logs.some(([state]) => state === 'action'));
  assert.ok(result.logs.some(([state, text]) => state === 'extracted' && text.includes(a) && text.includes('不验证')));
  assert.ok(result.closed);
});

test('extraction tool supports resetting and quitting while waiting for paste', async () => {
  const result = await acquire(['r', 'q']);
  assert.equal(result.reads, 2);
  assert.ok(!result.logs.some(([state]) => state === 'extracted'));
  assert.ok(result.logs.some(([state]) => state === 'stopped'));
  assert.ok(result.closed);
});
