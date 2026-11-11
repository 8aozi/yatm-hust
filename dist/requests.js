"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSession = exports.getStudentName = exports.studentsRole = exports.signIn = exports.activeSign = void 0;
const http_1 = require("./http");
const status_1 = require("./status");
const consts_1 = require("./consts");
const baseHeaders = {
    'User-Agent': consts_1.userAgent,
    'Content-Type': 'application/json',
    Accept: '*/*',
    'Accept-Language': 'zh-CN,en-US;qbaseHeaders=0.7,en;q=0.3',
};
exports.activeSign = (openId, signal) => http_1.requestJson('https://v18.teachermate.cn/wechat-api/v1/class-attendance/student/active_signs', {
    headers: {
        ...baseHeaders,
        openId,
        Referrer: `https://v18.teachermate.cn/wechat-pro-ssr/student/sign?openid=${openId}`,
    },
    method: 'GET',
    signal,
}).then(data => {
    if (!Array.isArray(data) || !data.every(sign => sign &&
        Number.isFinite(sign.courseId) && Number.isFinite(sign.signId) && typeof sign.name === 'string')) {
        throw http_1.apiFailure('查询签到', data);
    }
    return data;
});
exports.signIn = (openId, query, signal) => http_1.requestJson('https://v18.teachermate.cn/wechat-api/v1/class-attendance/student-sign-in', {
    headers: {
        ...baseHeaders,
        openId,
        Referrer: `https://v18.teachermate.cn/wechat-pro-ssr/student/sign?openid=${openId}`,
    },
    body: JSON.stringify(query),
    method: 'POST',
    signal,
}).then(data => {
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        (data.errorCode !== undefined && data.errorCode !== 0 && data.errorCode !== 305) ||
        ('message' in data && data.errorCode !== 0 && data.errorCode !== 305)) {
        throw http_1.apiFailure('提交签到', data);
    }
    return data;
});
exports.studentsRole = (openId, signal) => http_1.requestJson('https://v18.teachermate.cn/wechat-api/v2/students/role', {
    headers: {
        ...baseHeaders,
        openId,
        Referrer: `https://v18.teachermate.cn/wechat-pro/student/archive/lists?openid=${openId}`,
    },
    method: 'GET',
    signal,
});
const studentInfo = (openId, signal) => http_1.requestJson('https://v18.teachermate.cn/wechat-api/v2/students', {
    headers: {
        ...baseHeaders,
        openId,
        Referrer: `https://v18.teachermate.cn/wechat-pro/student/edit?openid=${openId}`,
    },
    method: 'GET',
    signal,
});
exports.getStudentName = async (openId, signal) => {
    const response = await studentInfo(openId, signal);
    if (!Array.isArray(response) || !Array.isArray(response[0]))
        throw http_1.apiFailure('获取学生姓名', response);
    const name = response[0].find(item => item && item.item_name === 'name')?.item_value;
    if (typeof name !== 'string' || !name.trim()) {
        throw new status_1.AppError('action', '未找到学生姓名，无法可靠识别二维码签到结果。', ['在微信微助教中检查学生身份和姓名，再获取新 URL 并重启', '修复接口适配后重启程序']);
    }
    return name;
};
exports.validateSession = async (openId, signal) => {
    const response = await exports.studentsRole(openId, signal);
    if (!Array.isArray(response))
        throw http_1.apiFailure('验证 openId', response);
    if (response.length === 0) {
        throw new status_1.AppError('action', '当前账号未返回学生身份；无法确认是凭据失效还是账号尚未绑定。', ['在微信检查账号和学生身份绑定，再获取新 URL 后重启', '使用正确的微信账号获取新 URL 后重启']);
    }
};
