"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signOnce = void 0;
const requests_1 = require("./requests");
const consts_1 = require("./consts");
const QRSign_1 = require("./QRSign");
const utils_1 = require("./utils");
const control_1 = require("./control");
const status_1 = require("./status");
exports.signOnce = async (ctx) => {
    const openId = ctx.openId;
    const signal = ctx.signal;
    control_1.checkInterrupted(signal);
    const data = await requests_1.activeSign(openId, signal);
    control_1.checkInterrupted(signal);
    if (ctx.openId !== openId)
        return;
    if (!data.length) {
        ctx.qrSign?.destory();
        ctx.qrSign = undefined;
        ctx.lastSignId = 0;
        status_1.status('running', `登录有效，暂无进行中的签到；${Math.ceil(Math.max(1000, consts_1.config.interval) / 1000)} 秒后继续检查，无需操作。`);
        return;
    }
    const queue = [...data.filter(sign => !sign.isQR), ...data.filter(sign => sign.isQR)];
    let pending = false;
    for (const sign of queue) {
        control_1.checkInterrupted(signal);
        const { signId, courseId, isGPS, isQR, name } = sign;
        if (ctx.signedIdSet.has(signId))
            continue;
        pending = true;
        const type = isQR ? (isGPS ? '扫码 + 定位签到' : '扫码签到') : (isGPS ? '定位签到（GPS）' : '普通签到');
        if (isQR) {
            if (signId === ctx.lastSignId && ctx.qrSign) {
                status_1.status('qr', `${name}：二维码订阅仍在运行，请用微信扫描终端中的最新二维码。`);
                continue;
            }
            ctx.qrSign?.destory();
            ctx.lastSignId = signId;
            status_1.status('qr', `${name}（${type}）：正在获取二维码，请等待显示后用微信扫码。`);
            if (isGPS)
                console.log('  此流程的定位由微信页面处理，本地预设不会传入扫码流程。');
            utils_1.sendNotificaition(`${name}：请用微信扫码签到。`);
            const qrSign = new QRSign_1.QRSign(ctx, { courseId, signId });
            ctx.qrSign = qrSign;
            qrSign.start().then(() => {
                if (ctx.qrSign !== qrSign)
                    return;
                ctx.signedIdSet.add(signId);
                status_1.status('success', `${name}：已收到二维码签到完成结果。`);
                if (!ctx.devtools) {
                    ctx.openIdSet.add(ctx.openId);
                    ctx.openId = '';
                    ctx.studentName = '';
                }
                else {
                    ctx.studentName = '';
                }
                qrSign.destory();
                ctx.qrSign = undefined;
                ctx.lastSignId = 0;
            }).catch(error => {
                if (ctx.qrSign !== qrSign)
                    return;
                qrSign.destory();
                ctx.qrSign = undefined;
                ctx.lastSignId = 0;
                ctx.qrError = error;
            });
        }
        else {
            status_1.status('running', `${name}（${type}）：准备提交签到。`);
            let query = { courseId, signId };
            if (isGPS) {
                const { lat, lon } = consts_1.config;
                console.log(`  使用定位：${consts_1.config.selectedLocation ?? '当前配置'}（纬度 ${lat}，经度 ${lon}）`);
                query = { ...query, lat, lon };
            }
            await control_1.pause(consts_1.config.wait, signal);
            control_1.checkInterrupted(signal);
            if (ctx.openId !== openId)
                return;
            const result = await requests_1.signIn(openId, query, signal);
            control_1.checkInterrupted(signal);
            ctx.signedIdSet.add(signId);
            status_1.status('success', `${name}：${result.errorCode === 305 ? '服务返回已签到（305）' : '签到请求成功'}。`);
        }
    }
    if (!pending)
        status_1.status('running', '当前列出的签到已处理，继续等待下一次签到，无需操作。');
};
