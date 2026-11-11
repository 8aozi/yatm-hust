export type ErrorKind = 'temporary' | 'auth' | 'input' | 'action';
export const DEFAULT_RETRY_MS = 5000;

export class AppError extends Error {
  constructor(
    public kind: ErrorKind,
    message: string,
    public actions: string[] = [],
    public retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const fallbackActions = [
  '重新启动程序，获取新的微信签到 URL，粘贴到终端并按回车',
  '检查网络或代理后重启程序',
  '更新或修复程序后重试',
];

export const safeDetail = (value: unknown) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
  .replace(/openid=[^&\s]+/gi, 'openid=[已省略]')
  .slice(0, 240);

export const classifyError = (error: unknown): AppError => {
  if (error instanceof AppError) return error;
  const item = error as { code?: string; type?: string; message?: string } | null;
  if (/^Unexpected server response: (?:5\d\d|408|429)$/.test(item?.message ?? '') ||
      /Opening handshake has timed out/.test(item?.message ?? '')) {
    return new AppError('temporary', '二维码服务连接暂时失败或超时。');
  }
  if (item?.message === 'Unexpected server response: 401') {
    return new AppError('action', '二维码服务拒绝连接（HTTP 401）；该连接不携带 openId，不能据此认定凭据过期。', fallbackActions);
  }
  if (['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN',
    'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE'].includes(item?.code ?? '') ||
    ['request-timeout', 'body-timeout'].includes(item?.type ?? '')) {
    return new AppError('temporary', `网络连接暂时失败（${safeDetail(item?.code ?? item?.type)}）。`);
  }
  return new AppError('action', `无法确定错误原因：${safeDetail(item?.message ?? error) || '未知错误'}。`, fallbackActions);
};

export type StatusKind = 'waiting' | 'extracted' | 'valid' | 'running' |
  'temporary' | 'action' | 'expired' | 'qr' | 'success' | 'stopped';
const labels: Record<StatusKind, string> = {
  waiting: '等待粘贴输入', extracted: 'openId 提取完成',
  valid: 'openId 验证通过', running: '运行正常', temporary: '临时故障｜自动重试',
  stopped: '已停止', action: '需要操作', expired: 'openId 已失效或被拒绝', qr: '等待微信扫码', success: '签到完成',
};

export const status = (kind: StatusKind, message: string, actions: string[] = []) => {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const output = `[${time}] 【${labels[kind]}】 ${message}`;
  console.log(output);
  if (actions.length) console.log(`  操作：${actions.join(' or ')}`);
};

export const reportError = (error: unknown, retryMs = DEFAULT_RETRY_MS, failures = 1): AppError => {
  const classified = classifyError(error);
  if (classified.kind === 'temporary') {
    const delay = Math.max(retryMs, classified.retryAfterMs ?? 0);
    status('temporary', `${classified.message} 当前 openId 保留，${Math.ceil(delay / 1000)} 秒后自动重试；请先等待，暂不需要重新粘贴凭据。`,
      failures >= 3 ? ['继续等待服务恢复', '检查网络或代理', '恢复网络后重新启动程序'] : []);
  } else if (classified.kind === 'auth') {
    status('expired', classified.message, ['在微信重新打开签到页并复制新的完整 URL，粘贴到终端并按回车']);
  } else if (classified.kind === 'input') {
    status('action', classified.message, classified.actions);
  } else {
    status('action', `${classified.message} 程序已停止。`, classified.actions.length ? classified.actions : fallbackActions);
  }
  return classified;
};

export const pasteInstruction = '在电脑微信打开「微助教服务号 → 学生 → 签到」并复制页面链接，粘贴到本终端后按回车；也可粘贴完整的 openId。';
