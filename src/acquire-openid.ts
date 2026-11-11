import { extractOpenId } from './openid';
import { createTerminalInput } from './terminal';
import { checkInterrupted, SessionControl } from './control';
import { pasteInstruction, reportError, status } from './status';

export const main = async () => {
  const control = new SessionControl();
  const terminal = createTerminalInput(command => control.request(command));
  try {
    for (;;) {
      const command = control.pending ? control.consume() : undefined;
      if (command === 'quit') { status('stopped', '获取工具已退出。'); return; }
      const signal = control.signal;
      try {
        status('waiting', pasteInstruction);
        const input = command && typeof command === 'object' ? command.value : await terminal.readCredential(signal);
        checkInterrupted(signal);
        const id = extractOpenId(input);
        if (!id) {
          status('action', '未识别到有效凭据，请粘贴带 openid 参数的完整微信 URL 或 32 位 openId 后按回车。');
          continue;
        }
        status('extracted', `openId = ${id}。此工具只提取凭据，不验证有效性。`);
        console.log('获取工具正常结束；需要使用时请从终端复制上方 openId。');
        return;
      } catch (error) {
        if (!signal.aborted) throw error;
      }
    }
  } finally { terminal.close(); }
};

if (require.main === module) {
  main().catch(error => {
    reportError(error);
    process.exitCode = 1;
  });
}
