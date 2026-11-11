import { createInterface } from 'readline';
import { Readable, Writable } from 'stream';
import { InputInterrupted, RuntimeCommand } from './control';
import { AppError, status } from './status';
import { extractOpenId } from './openid';

export interface TerminalInput {
  readCredential(signal?: AbortSignal): Promise<string>;
  close(): void;
}

export const createTerminalInput = (
  onCommand: (command: RuntimeCommand) => void,
  input: Readable & { isTTY?: boolean } = process.stdin,
  output: Writable & { isTTY?: boolean } = process.stdout,
): TerminalInput => {
  if (!input.isTTY) return {
    readCredential: async () => { throw new AppError('action', '粘贴输入需要交互终端。', ['在终端重新打开程序', '双击对应系统文件夹中的启动文件']); },
    close: () => {},
  };
  const reader = createInterface({ input, output, terminal: Boolean(input.isTTY && output.isTTY) });
  let closing = false;
  let pending: { finish(value?: string, error?: Error): void } | undefined;
  const commands = new Map<string, RuntimeCommand>([['r', 'reset'], ['q', 'quit']]);
  reader.on('line', text => {
    const command = commands.get(text.trim().toLowerCase());
    if (command) { onCommand(command); return; }
    if (pending) pending.finish(text);
    else if (extractOpenId(text)) onCommand({ type: 'credential', value: text });
    else if (text.trim()) status('action', '未识别到有效凭据。可直接粘贴完整微信 URL 或 32 位 openId 后按回车；R + 回车暂停并等待重新粘贴。当前会话保持不变。');
  });
  reader.on('SIGINT', () => onCommand('quit'));
  reader.on('close', () => { if (!closing) onCommand('quit'); });
  output.write('随时可直接粘贴 URL 或 openId 并按回车；R + 回车 = 暂停并等待重新粘贴；Q + 回车或 Control+C = 退出。\n');
  return {
    readCredential: signal => new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new InputInterrupted()); return; }
      const onAbort = () => pending?.finish(undefined, new InputInterrupted());
      pending = { finish: (value, error) => {
        signal?.removeEventListener('abort', onAbort);
        pending = undefined;
        if (error) reject(error); else resolve(value ?? '');
      } };
      signal?.addEventListener('abort', onAbort, { once: true });
      output.write('URL / openId: ');
    }),
    close: () => {
      closing = true;
      pending?.finish(undefined, new InputInterrupted());
      reader.close();
      input.pause();
    },
  };
};
