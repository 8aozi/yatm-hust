const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Response, FetchError } = require('node-fetch');
const { requestJson, apiFailure } = require('../dist/http.js');
const { AppError, classifyError, reportError, status } = require('../dist/status.js');

const request = (code, body = '{}', headers = {}) => requestJson('https://example.test/', {}, async () =>
  new Response(body, { status: code, headers }));

test('HTTP auth, temporary and ambiguous failures are distinguished', async () => {
  await assert.rejects(request(401), e => e.kind === 'auth');
  for (const code of [408, 425, 429, 500, 502, 503]) {
    await assert.rejects(request(code), e => e.kind === 'temporary');
  }
  for (const code of [403, 404]) await assert.rejects(request(code), e => e.kind === 'action');
  await assert.rejects(request(429, '', { 'Retry-After': '30' }), e => e.retryAfterMs === 30000);
});

test('successful JSON is decoded and requests have a bounded timeout', async () => {
  const result = await requestJson('https://example.test/', { method: 'GET' }, async (url, options) => {
    assert.equal(options.timeout, 15000);
    assert.equal(options.method, 'GET');
    return new Response('[{"id":1}]');
  });
  assert.deepEqual(result, [{ id: 1 }]);
  await assert.rejects(request(200, '<html>login portal</html>'), e => e.kind === 'action');
});

test('network failure remains temporary; arbitrary server messages do not imply expiry', () => {
  for (const error of [Object.assign(new Error(), { code: 'ECONNRESET' }),
    new FetchError('timeout', 'request-timeout'), new Error('Unexpected server response: 502')]) {
    assert.equal(classifyError(error).kind, 'temporary');
  }
  assert.equal(apiFailure('身份查询', { message: '服务正在维护' }).kind, 'action');
  assert.equal(apiFailure('身份查询', { message: 'openid expired' }).kind, 'auth');
  assert.equal(apiFailure('身份查询', { errorCode: 401 }).kind, 'auth');
  assert.equal(classifyError(new Error('Unexpected server response: 401')).kind, 'action');
});

test('terminal clearly labels waiting, verified, 5-second retry, and actionable errors', () => {
  const lines = [];
  const original = console.log;
  console.log = line => lines.push(line);
  try {
    status('waiting', '粘贴链接后回车');
    status('valid', `姓名：测试学生；openId = ${'a'.repeat(32)}`);
    reportError(new AppError('temporary', '连接失败'), undefined, 3);
    reportError(new Error('unknown'));
  } finally { console.log = original; }
  assert.ok(lines.some(x => x.includes('等待粘贴输入')));
  assert.ok(lines.some(x => x.includes('openId 验证通过') && x.includes('a'.repeat(32)) && x.includes('测试学生')));
  assert.ok(!lines.some(x => /已读取 openId|正在验证 openId/.test(x)));
  assert.ok(lines.some(x => x.includes('临时故障｜自动重试') && x.includes('5 秒')));
  assert.ok(lines.some(x => x.includes('程序已停止')));
  assert.ok(lines.some(x => x.includes(' or ')));
});

test('HTTP requests receive the native abort signal used for credential replacement', async () => {
  const controller = new AbortController();
  const result = requestJson('https://example.test/', { signal: controller.signal }, async (_, options) => {
    assert.equal(options.signal, controller.signal);
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('request aborted')), { once: true });
    });
  });
  controller.abort();
  await assert.rejects(result, /request aborted/);
});
