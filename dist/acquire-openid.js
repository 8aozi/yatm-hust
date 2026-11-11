"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const openid_1 = require("./openid");
const terminal_1 = require("./terminal");
const control_1 = require("./control");
const status_1 = require("./status");
exports.main = async () => {
    const control = new control_1.SessionControl();
    const terminal = terminal_1.createTerminalInput(command => control.request(command));
    try {
        for (;;) {
            const command = control.pending ? control.consume() : undefined;
            if (command === 'quit') {
                status_1.status('stopped', '获取工具已退出。');
                return;
            }
            const signal = control.signal;
            try {
                status_1.status('waiting', status_1.pasteInstruction);
                const input = command && typeof command === 'object' ? command.value : await terminal.readCredential(signal);
                control_1.checkInterrupted(signal);
                const id = openid_1.extractOpenId(input);
                if (!id) {
                    status_1.status('action', '未识别到有效凭据，请粘贴带 openid 参数的完整微信 URL 或 32 位 openId 后按回车。');
                    continue;
                }
                status_1.status('extracted', `openId = ${id}。此工具只提取凭据，不验证有效性。`);
                console.log('获取工具正常结束；需要使用时请从终端复制上方 openId。');
                return;
            }
            catch (error) {
                if (!signal.aborted)
                    throw error;
            }
        }
    }
    finally {
        terminal.close();
    }
};
if (require.main === module) {
    exports.main().catch(error => {
        status_1.reportError(error);
        process.exitCode = 1;
    });
}
