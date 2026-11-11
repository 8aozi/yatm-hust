"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pasteInstruction = exports.reportError = exports.status = exports.classifyError = exports.safeDetail = exports.fallbackActions = exports.AppError = exports.DEFAULT_RETRY_MS = void 0;
exports.DEFAULT_RETRY_MS = 5000;
class AppError extends Error {
    constructor(kind, message, actions = [], retryAfterMs) {
        super(message);
        this.kind = kind;
        this.actions = actions;
        this.retryAfterMs = retryAfterMs;
        this.name = 'AppError';
    }
}
exports.AppError = AppError;
exports.fallbackActions = [
    '重新启动程序，获取新的微信签到 URL，粘贴到终端并按回车',
    '检查网络或代理后重启程序',
    '更新或修复程序后重试',
];
exports.safeDetail = (value) => String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/openid=[^&\s]+/gi, 'openid=[已省略]')
    .slice(0, 240);
exports.classifyError = (error) => {
    if (error instanceof AppError)
        return error;
    const item = error;
    if (/^Unexpected server response: (?:5\d\d|408|429)$/.test(item?.message ?? '') ||
        /Opening handshake has timed out/.test(item?.message ?? '')) {
        return new AppError('temporary', '二维码服务连接暂时失败或超时。');
    }
    if (item?.message === 'Unexpected server response: 401') {
        return new AppError('action', '二维码服务拒绝连接（HTTP 401）；该连接不携带 openId，不能据此认定凭据过期。', exports.fallbackActions);
    }
    if (['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN',
        'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE'].includes(item?.code ?? '') ||
        ['request-timeout', 'body-timeout'].includes(item?.type ?? '')) {
        return new AppError('temporary', `网络连接暂时失败（${exports.safeDetail(item?.code ?? item?.type)}）。`);
    }
    return new AppError('action', `无法确定错误原因：${exports.safeDetail(item?.message ?? error) || '未知错误'}。`, exports.fallbackActions);
};
const labels = {
    waiting: '等待粘贴输入', extracted: 'openId 提取完成',
    valid: 'openId 验证通过', running: '运行正常', temporary: '临时故障｜自动重试',
    stopped: '已停止', action: '需要操作', expired: 'openId 已失效或被拒绝', qr: '等待微信扫码', success: '签到完成',
};
exports.status = (kind, message, actions = []) => {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const output = `[${time}] 【${labels[kind]}】 ${message}`;
    console.log(output);
    if (actions.length)
        console.log(`  操作：${actions.join(' or ')}`);
};
exports.reportError = (error, retryMs = exports.DEFAULT_RETRY_MS, failures = 1) => {
    const classified = exports.classifyError(error);
    if (classified.kind === 'temporary') {
        const delay = Math.max(retryMs, classified.retryAfterMs ?? 0);
        exports.status('temporary', `${classified.message} 当前 openId 保留，${Math.ceil(delay / 1000)} 秒后自动重试；请先等待，暂不需要重新粘贴凭据。`, failures >= 3 ? ['继续等待服务恢复', '检查网络或代理', '恢复网络后重新启动程序'] : []);
    }
    else if (classified.kind === 'auth') {
        exports.status('expired', classified.message, ['在微信重新打开签到页并复制新的完整 URL，粘贴到终端并按回车']);
    }
    else if (classified.kind === 'input') {
        exports.status('action', classified.message, classified.actions);
    }
    else {
        exports.status('action', `${classified.message} 程序已停止。`, classified.actions.length ? classified.actions : exports.fallbackActions);
    }
    return classified;
};
exports.pasteInstruction = '在电脑微信打开「微助教服务号 → 学生 → 签到」并复制页面链接，粘贴到本终端后按回车；也可粘贴完整的 openId。';
