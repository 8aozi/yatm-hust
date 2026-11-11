const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractOpenId } = require('../dist/openid.js');
const oldId = 'a'.repeat(32);
const newId = 'b'.repeat(32);
const link = id => `https://v18.teachermate.cn/wechat-pro-ssr/student/sign?openid=${id}`;

test('accepts copied URL with whitespace, query parameters and fragment', () => {
  assert.equal(extractOpenId(` \n${link(newId)}&x=1#section\n`, false), newId);
  assert.equal(extractOpenId(`https://v18.teachermate.cn/?openId=${newId}`), newId);
  assert.equal(extractOpenId(newId), newId);
  assert.equal(extractOpenId(newId, false), undefined);
});

test('ignores unrelated, malformed, ambiguous and lookalike pasted content', () => {
  for (const text of [
    '', 'ordinary pasted text', 'x'.repeat(32),
    `https://example.com/?openid=${newId}`,
    `https://v18.teachermate.cn.example.com/?openid=${newId}`,
    `https://v18.teachermate.cn@example.com/?openid=${newId}`,
    `http://v18.teachermate.cn/?openid=${newId}`,
    `${link(newId)}&openId=${oldId}`,
    link('b'.repeat(31)),
  ]) assert.equal(extractOpenId(text), undefined);
});
