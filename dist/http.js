"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiFailure = exports.requestJson = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
const status_1 = require("./status");
exports.requestJson = async (url, init, fetcher = node_fetch_1.default) => {
    // node-fetch 2 supports native signals; its older type definitions predate the DOM signature.
    const response = await fetcher(url, {
        timeout: 15000, ...init,
        signal: init?.signal,
    });
    if (response.status === 401) {
        throw new status_1.AppError('auth', '服务返回 HTTP 401，当前登录凭据未被接受。');
    }
    if ([408, 425, 429].includes(response.status) || response.status >= 500) {
        const header = response.headers.get('retry-after');
        const delay = header ? (/^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : 0;
        throw new status_1.AppError('temporary', `微助教服务暂不可用或请求受限（HTTP ${response.status}）。`, [], Number.isFinite(delay) && delay > 0 ? Math.min(delay, 2147483647) : undefined);
    }
    if (!response.ok) {
        throw new status_1.AppError('action', `接口返回 HTTP ${response.status}，不能据此确定 openId 是否失效。`, status_1.fallbackActions);
    }
    try {
        return await response.json();
    }
    catch (error) {
        // A read timeout or interrupted connection is recoverable; malformed JSON is not evidence of expiry.
        if (error.type !== 'invalid-json')
            throw error;
        throw new status_1.AppError('action', '接口未返回可识别的数据，可能是网络登录页或接口发生变化。', status_1.fallbackActions);
    }
};
exports.apiFailure = (operation, data) => {
    const value = data && typeof data === 'object' ? data : {};
    const message = typeof value.message === 'string' ? value.message : '';
    const code = value.errorCode ?? value.code;
    const explicitAuth = code === 401 || code === '401' ||
        /(?:openid.{0,30}(?:invalid|expired|无效|失效|过期)|(?:invalid|expired).{0,20}openid|登录(?:已)?(?:过期|失效)|未登录)/i.test(message);
    if (explicitAuth)
        return new status_1.AppError('auth', `${operation}：服务明确拒绝了当前登录凭据。${status_1.safeDetail(message)}`);
    return new status_1.AppError('action', `${operation}未成功或响应格式不符。${code !== undefined ? `错误码：${status_1.safeDetail(code)}。` : ''}${status_1.safeDetail(message)}`, status_1.fallbackActions);
};
