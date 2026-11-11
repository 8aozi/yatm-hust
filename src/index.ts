import { validateSession, getStudentName } from './requests';
import { config } from './consts';
import { extractOpenId, sendNotificaition } from './utils';
import { IContext, signOnce } from './sign';
import { createTerminalInput, TerminalInput } from './terminal';
import { checkInterrupted, pause, SessionControl } from './control';
import { AppError, classifyError, pasteInstruction, DEFAULT_RETRY_MS, reportError, status } from './status';

const getOpenId = async (terminal: TerminalInput, signal: AbortSignal, supplied?: string) => {
  if (supplied === undefined) status('waiting', pasteInstruction);
  const input = supplied ?? await terminal.readCredential(signal);
  checkInterrupted(signal);
  const openId = extractOpenId(input);
  if (!openId) throw new AppError('input', '未识别到格式正确的 openId，程序将继续等待粘贴输入。', [
    '重新获取带 openid 参数的微助教完整 URL，粘贴到终端并按回车',
    '粘贴完整的 32 位 openId 并按回车',
  ]);
  return openId;
};

export const main = async () => {
  const control = new SessionControl();
  const ctx: IContext = {
    openId: '', studentName: '', lastSignId: 0, signal: control.signal,
    signedIdSet: new Set(), openIdSet: new Set(),
  };
  let queuedCredential: string | undefined;
  const terminal = createTerminalInput(command => {
    const replacement = typeof command === 'object' ? extractOpenId(command.value) : undefined;
    if (!replacement || replacement !== ctx.openId) ctx.signedIdSet.clear();
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
        if (command === 'quit') { status('stopped', '程序已退出。'); return; }
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
          checkInterrupted(signal);
          ctx.openId = openId;
          ctx.studentName = '';
        }
        attemptedOpenId = ctx.openId;
        await validateSession(attemptedOpenId, signal);
        checkInterrupted(signal);
        if (ctx.openId !== attemptedOpenId) continue;
        const needsName = !ctx.studentName;
        if (needsName) {
          const name = await getStudentName(attemptedOpenId, signal);
          checkInterrupted(signal);
          if (ctx.openId !== attemptedOpenId) continue;
          ctx.studentName = name;
        }
        if (needsName || failures) status('valid', `姓名：${ctx.studentName}；openId = ${ctx.openId}`);
        await signOnce(ctx);
        checkInterrupted(signal);
        if (failures && !ctx.qrError) status('running', '签到查询已恢复响应，继续运行。');
        failures = 0;
        await pause(Math.max(1000, config.interval), signal);
      } catch (error) {
        if (signal.aborted) continue;
        const classified = classifyError(error);
        if (classified.kind === 'auth') {
          if (ctx.openId !== attemptedOpenId) continue;
          status('expired', `服务拒绝 openId = ${ctx.openId}；将停止使用该凭据。`);
          reportError(classified);
          sendNotificaition('登录凭据被拒绝，请获取新的微信签到链接，粘贴到终端并按回车。');
          ctx.openIdSet.add(ctx.openId);
          ctx.openId = '';
          ctx.studentName = '';
          ctx.qrSign?.destory();
          ctx.qrSign = undefined;
          ctx.lastSignId = 0;
          failures = 0;
        } else if (classified.kind === 'temporary') {
          failures++;
          const retryMs = Math.max(DEFAULT_RETRY_MS, classified.retryAfterMs ?? 0);
          reportError(classified, retryMs, failures);
          try { await pause(retryMs, signal); } catch (interrupted) {
            if (!signal.aborted) throw interrupted;
          }
        } else if (classified.kind === 'input') {
          reportError(classified);
        } else {
          reportError(classified);
          process.exitCode = 1;
          return;
        }
      }
    }
  } finally {
    terminal.close();
    ctx.qrSign?.destory();
  }
};

if (require.main === module) {
  main().catch(error => {
    reportError(error);
    process.exitCode = 1;
  });
}
