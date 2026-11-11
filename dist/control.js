"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionControl = exports.pause = exports.checkInterrupted = exports.InputInterrupted = void 0;
class InputInterrupted extends Error {
    constructor() { super('Input interrupted'); this.name = 'InputInterrupted'; }
}
exports.InputInterrupted = InputInterrupted;
exports.checkInterrupted = (signal) => {
    if (signal?.aborted)
        throw new InputInterrupted();
};
exports.pause = (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) {
        reject(new InputInterrupted());
        return;
    }
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); cleanup(); reject(new InputInterrupted()); };
    signal?.addEventListener('abort', onAbort, { once: true });
});
class SessionControl {
    constructor() {
        this.controller = new AbortController();
    }
    get signal() { return this.controller.signal; }
    request(command) {
        this.pending = command;
        this.controller.abort();
    }
    consume() {
        const command = this.pending;
        this.pending = undefined;
        this.controller = new AbortController();
        return command;
    }
}
exports.SessionControl = SessionControl;
