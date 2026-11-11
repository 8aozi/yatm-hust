"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const requests_1 = require("./requests");
const consts_1 = require("./consts");
const utils_1 = require("./utils");
const sign_1 = require("./sign");
const terminal_1 = require("./terminal");
const control_1 = require("./control");
const status_1 = require("./status");
const getOpenId = async (terminal, signal, supplied) => {
    if (supplied === undefined)
        status_1.status('waiting', status_1.pasteInstruction);
    const input = supplied ?? await terminal.readCredential(signal);
    control_1.checkInterrupted(signal);
    const openId = utils_1.extractOpenId(input);
    if (!openId)
        throw new status_1.AppError('input', '未识别到格式正确的 openId，程序将继续等待粘贴输入。', [
            '重新获取带 openid 参数的微助教完整 URL，粘贴到终端并按回车',
            '粘贴完整的 32 位 openId 并按回车',
        ]);
    return openId;
};
exports.main = async () => {
    const control = new control_1.SessionControl();
    const ctx = {
        openId: '', studentName: '', lastSignId: 0, signal: control.signal,
        signedIdSet: new Set(), openIdSet: new Set(),
    };
    let queuedCredential;
    const terminal = terminal_1.createTerminalInput(command => {
        const replacement = typeof command === 'object' ? utils_1.extractOpenId(command.value) : undefined;
        if (!replacement || replacement !== ctx.openId)
            ctx.signedIdSet.clear();
        ctx.openId = '';
        ctx.studentName = '';
        ctx.qrError = undefined;
        const qrSign = ctx.qrSign;
        ctx.qrSign = undefined;
        ctx.lastSignId = 0;
        qrSign?.destory();
        control.request(command);
    });
    let failures = 0;
    try {
        for (;;) {
            if (control.pending) {
                const command = control.consume();
                if (command === 'quit') {
                    status_1.status('stopped', '程序已退出。');
                    return;
                }
                queuedCredential = command && typeof command === 'object' ? command.value : undefined;
                failures = 0;
            }
            const signal = control.signal;
            ctx.signal = signal;
            let attemptedOpenId = ctx.openId;
            try {
                if (ctx.qrError) {
                    const error = ctx.qrError;
                    ctx.qrError = undefined;
                    throw error;
                }
                if (!ctx.openId) {
                    const supplied = queuedCredential;
                    queuedCredential = undefined;
                    const openId = await getOpenId(terminal, signal, supplied);
                    control_1.checkInterrupted(signal);
                    ctx.openId = openId;
                    ctx.studentName = '';
                }
                attemptedOpenId = ctx.openId;
                await requests_1.validateSession(attemptedOpenId, signal);
                control_1.checkInterrupted(signal);
                if (ctx.openId !== attemptedOpenId)
                    continue;
                const needsName = !ctx.studentName;
                if (needsName) {
                    const name = await requests_1.getStudentName(attemptedOpenId, signal);
                    control_1.checkInterrupted(signal);
                    if (ctx.openId !== attemptedOpenId)
                        continue;
                    ctx.studentName = name;
                }
                if (needsName || failures)
                    status_1.status('valid', `姓名：${ctx.studentName}；openId = ${ctx.openId}`);
                await sign_1.signOnce(ctx);
                control_1.checkInterrupted(signal);
                if (failures && !ctx.qrError)
                    status_1.status('running', '签到查询已恢复响应，继续运行。');
                failures = 0;
                await control_1.pause(Math.max(1000, consts_1.config.interval), signal);
            }
            catch (error) {
                if (signal.aborted)
                    continue;
                const classified = status_1.classifyError(error);
                if (classified.kind === 'auth') {
                    if (ctx.openId !== attemptedOpenId)
                        continue;
                    status_1.status('expired', `服务拒绝 openId = ${ctx.openId}；将停止使用该凭据。`);
                    status_1.reportError(classified);
                    utils_1.sendNotificaition('登录凭据被拒绝，请获取新的微信签到链接，粘贴到终端并按回车。');
                    ctx.openIdSet.add(ctx.openId);
                    ctx.openId = '';
                    ctx.studentName = '';
                    ctx.qrSign?.destory();
                    ctx.qrSign = undefined;
                    ctx.lastSignId = 0;
                    failures = 0;
                }
                else if (classified.kind === 'temporary') {
                    failures++;
                    const retryMs = Math.max(status_1.DEFAULT_RETRY_MS, classified.retryAfterMs ?? 0);
                    status_1.reportError(classified, retryMs, failures);
                    try {
                        await control_1.pause(retryMs, signal);
                    }
                    catch (interrupted) {
                        if (!signal.aborted)
                            throw interrupted;
                    }
                }
                else if (classified.kind === 'input') {
                    status_1.reportError(classified);
                }
                else {
                    status_1.reportError(classified);
                    process.exitCode = 1;
                    return;
                }
            }
        }
    }
    finally {
        terminal.close();
        ctx.qrSign?.destory();
    }
};
if (require.main === module) {
    exports.main().catch(error => {
        status_1.reportError(error);
        process.exitCode = 1;
    });
}
