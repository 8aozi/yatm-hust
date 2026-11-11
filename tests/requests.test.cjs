const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { apiFailure } = require('../dist/http.js');
const { AppError } = require('../dist/status.js');

function api(response) {
  const module = { exports: {} };
  const requests = [];
  const mocks = {
    './http': { apiFailure, requestJson: async (url, options) => { requests.push({ url, options }); return response; } },
    './status': { AppError }, './consts': { userAgent: 'test' },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/requests.js'), 'utf8'), {
    module, exports: module.exports, require: name => {
      assert.ok(name in mocks, `Unexpected dependency ${name}`);
      return mocks[name];
    },
  });
  return { ...module.exports, requests };
}

test('a missing student role is actionable, not automatically labelled as expired', async () => {
  await assert.rejects(api([]).validateSession('test'), e => e.kind === 'action');
  await assert.rejects(api({ message: 'maintenance' }).validateSession('test'), e => e.kind === 'action');
  await assert.rejects(api({ message: 'openid invalid' }).validateSession('test'), e => e.kind === 'auth');
  await api([{ student_id: 123 }]).validateSession('test');
});

test('student name extraction handles malformed responses with explicit guidance', async () => {
  assert.equal(await api([[{ item_name: 'name', item_value: '测试学生' }]]).getStudentName('test'), '测试学生');
  for (const response of [null, {}, [], [[]]]) {
    await assert.rejects(api(response).getStudentName('test'), e => e.kind === 'action' && e.actions.length > 0);
  }
});

test('sign-in errors are propagated instead of being swallowed as success', async () => {
  const query = { courseId: 1, signId: 2, lat: 30, lon: 114 };
  const service = api({ errorCode: 0 });
  await service.signIn('test', query);
  assert.deepEqual(JSON.parse(service.requests[0].options.body), query);
  await api({ errorCode: 305 }).signIn('test', query);
  for (const response of [null, [], { errorCode: 999, message: 'unknown' }]) {
    await assert.rejects(api(response).signIn('test', query), e => e.kind === 'action');
  }
  await assert.rejects(api({ errorCode: 401 }).signIn('test', query), e => e.kind === 'auth');
});

test('active sign queries distinguish an empty list from invalid server data', async () => {
  assert.equal((await api([]).activeSign('test')).length, 0);
  const service = api([{ courseId: 1, signId: 2, name: '测试课程', isGPS: 1 }]);
  assert.equal((await service.activeSign('test')).length, 1);
  assert.equal(service.requests[0].options.headers['If-None-Match'], undefined);
  await assert.rejects(api({ message: 'unknown' }).activeSign('test'), e => e.kind === 'action');
});
