import { activeSign, ISignInQuery, signIn } from './requests';
import { config } from './consts';
import { QRSign } from './QRSign';
import { sendNotificaition } from './utils';
import { checkInterrupted, pause } from './control';
import { WechatDevtools } from './cdp';
import { status } from './status';

export interface IContext {
  openId: string;
  signal?: AbortSignal;
  studentName: string;
  devtools?: WechatDevtools;
  lastSignId: number;
  qrSign?: QRSign;
  qrError?: unknown;
  signedIdSet: Set<number>;
  openIdSet: Set<string>;
}

export const signOnce = async (ctx: IContext) => {
  const openId = ctx.openId;
  const signal = ctx.signal;
  checkInterrupted(signal);
  const data = await activeSign(openId, signal);
  checkInterrupted(signal);
  if (ctx.openId !== openId) return;
  if (!data.length) {
    ctx.qrSign?.destory();
    ctx.qrSign = undefined;
    ctx.lastSignId = 0;
    status('running', `登录有效，暂无进行中的签到；${Math.ceil(Math.max(1000, config.interval) / 1000)} 秒后继续检查，无需操作。`);
    return;
  }
  const queue = [...data.filter(sign => !sign.isQR), ...data.filter(sign => sign.isQR)];
  let pending = false;
  for (const sign of queue) {
    checkInterrupted(signal);
    const { signId, courseId, isGPS, isQR, name } = sign;
    if (ctx.signedIdSet.has(signId)) continue;
    pending = true;
    const type = isQR ? (isGPS ? '扫码 + 定位签到' : '扫码签到') : (isGPS ? '定位签到（GPS）' : '普通签到');
    if (isQR) {
      if (signId === ctx.lastSignId && ctx.qrSign) {
        status('qr', `${name}：二维码订阅仍在运行，请用微信扫描终端中的最新二维码。`);
        continue;
      }
      ctx.qrSign?.destory();
      ctx.lastSignId = signId;
      status('qr', `${name}（${type}）：正在获取二维码，请等待显示后用微信扫码。`);
      if (isGPS) console.log('  此流程的定位由微信页面处理，本地预设不会传入扫码流程。');
      sendNotificaition(`${name}：请用微信扫码签到。`);
      const qrSign = new QRSign(ctx, { courseId, signId });
      ctx.qrSign = qrSign;
      qrSign.start().then(() => {
        if (ctx.qrSign !== qrSign) return;
        ctx.signedIdSet.add(signId);
        status('success', `${name}：已收到二维码签到完成结果。`);
        if (!ctx.devtools) {
          ctx.openIdSet.add(ctx.openId);
          ctx.openId = '';
          ctx.studentName = '';

        } else {
          ctx.studentName = '';
        }
        qrSign.destory();
        ctx.qrSign = undefined;
        ctx.lastSignId = 0;
      }).catch(error => {
        if (ctx.qrSign !== qrSign) return;
        qrSign.destory();
        ctx.qrSign = undefined;
        ctx.lastSignId = 0;
        ctx.qrError = error;
      });
    } else {
      status('running', `${name}（${type}）：准备提交签到。`);
      let query: ISignInQuery = { courseId, signId };
      if (isGPS) {
        const { lat, lon } = config;
        console.log(`  使用定位：${config.selectedLocation ?? '当前配置'}（纬度 ${lat}，经度 ${lon}）`);
        query = { ...query, lat, lon };
      }
      await pause(config.wait, signal);
      checkInterrupted(signal);
      if (ctx.openId !== openId) return;
      const result = await signIn(openId, query, signal);
      checkInterrupted(signal);
      ctx.signedIdSet.add(signId);
      status('success', `${name}：${result.errorCode === 305 ? '服务返回已签到（305）' : '签到请求成功'}。`);
    }
  }
  if (!pending) status('running', '当前列出的签到已处理，继续等待下一次签到，无需操作。');
};
