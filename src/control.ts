export type RuntimeCommand = 'reset' | 'quit' | { type: 'credential'; value: string };

export class InputInterrupted extends Error {
  constructor() { super('Input interrupted'); this.name = 'InputInterrupted'; }
}

export const checkInterrupted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new InputInterrupted();
};

export const pause = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(new InputInterrupted()); return; }
  const cleanup = () => signal?.removeEventListener('abort', onAbort);
  const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
  const onAbort = () => { clearTimeout(timer); cleanup(); reject(new InputInterrupted()); };
  signal?.addEventListener('abort', onAbort, { once: true });
});

export class SessionControl {
  private controller = new AbortController();
  pending?: RuntimeCommand;
  get signal() { return this.controller.signal; }
  request(command: RuntimeCommand) {
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
