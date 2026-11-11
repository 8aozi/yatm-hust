"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTerminalInput = void 0;
const readline_1 = require("readline");
const control_1 = require("./control");
const status_1 = require("./status");
const openid_1 = require("./openid");
exports.createTerminalInput = (onCommand, input = process.stdin, output = process.stdout) => {
    if (!input.isTTY)
        return {
            readCredential: async () => { throw new status_1.AppError('action', '粘贴输入需要交互终端。', ['在终端重新打开程序', '双击对应系统文件夹中的启动文件']); },
            close: () => { },
        };
    const reader = readline_1.createInterface({ input, output, terminal: Boolean(input.isTTY && output.isTTY) });
    let closing = false;
    let pending;
    const commands = new Map([['r', 'reset'], ['q', 'quit']]);
    reader.on('line', text => {
        const command = commands.get(text.trim().toLowerCase());
        if (command) {
            onCommand(command);
            return;
        }
        if (pending)
            pending.finish(text);
        else if (openid_1.extractOpenId(text))
            onCommand({ type: 'credential', value: text });
        else if (text.trim())
            status_1.status('action', '未识别到有效凭据。可直接粘贴完整微信 URL 或 32 位 openId 后按回车；R + 回车暂停并等待重新粘贴。当前会话保持不变。');
    });
    reader.on('SIGINT', () => onCommand('quit'));
    reader.on('close', () => { if (!closing)
        onCommand('quit'); });
    output.write('随时可直接粘贴 URL 或 openId 并按回车；R + 回车 = 暂停并等待重新粘贴；Q + 回车或 Control+C = 退出。\n');
    return {
        readCredential: signal => new Promise((resolve, reject) => {
            if (signal?.aborted) {
                reject(new control_1.InputInterrupted());
                return;
            }
            const onAbort = () => pending?.finish(undefined, new control_1.InputInterrupted());
            pending = { finish: (value, error) => {
                    signal?.removeEventListener('abort', onAbort);
                    pending = undefined;
                    if (error)
                        reject(error);
                    else
                        resolve(value ?? '');
                } };
            signal?.addEventListener('abort', onAbort, { once: true });
            output.write('URL / openId: ');
        }),
        close: () => {
            closing = true;
            pending?.finish(undefined, new control_1.InputInterrupted());
            reader.close();
            input.pause();
        },
    };
};
