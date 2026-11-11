"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QRSign = void 0;
const ws_1 = __importDefault(require("ws"));
const qrcode_1 = require("qrcode");
const consts_1 = require("./consts");
const utils_1 = require("./utils");
const status_1 = require("./status");
const debugLogger = utils_1.makeDebugLogger('QRSign::');
var QRType;
(function (QRType) {
    QRType[QRType["default"] = 0] = "default";
    QRType[QRType["code"] = 1] = "code";
    QRType[QRType["unknown"] = 2] = "unknown";
    QRType[QRType["result"] = 3] = "result";
})(QRType || (QRType = {}));
class QRSign {
    constructor(ctx, info) {
        // fields
        this._seqId = 0;
        this.clientId = '';
        this.client = null;
        this.onError = null;
        this.onSuccess = null;
        this.currentQRUrl = '';
        this.stopped = false;
        this.fail = (error) => {
            if (this.stopped)
                return;
            this.onError?.(error);
            this.destory();
        };
        this.start = () => new Promise((resolve, reject) => {
            this.startSync(resolve, reject);
        });
        this.sendMessage = (msg) => {
            debugLogger(`sendMessage`, msg);
            const raw = JSON.stringify(msg ? [msg] : []);
            try {
                if (this.client?.readyState === ws_1.default.OPEN)
                    this.client.send(raw);
                else
                    this.fail(new status_1.AppError('temporary', '二维码连接尚未就绪或已断开。'));
            }
            catch (error) {
                this.fail(error);
            }
        };
        this.handleQRSubscription = async (message) => {
            const { data } = message;
            switch (data.type) {
                case QRType.code: {
                    const { qrUrl } = data;
                    if (!qrUrl || qrUrl === this.currentQRUrl) {
                        return;
                    }
                    this.currentQRUrl = qrUrl;
                    status_1.status('qr', '已收到新的签到二维码，请使用微信扫描下方最新二维码或在微信打开对应链接。');
                    // TODO: should devtools conflict with printer?
                    if (this.ctx.devtools) {
                        // automation via devtools
                        const result = await this.ctx.devtools.finishQRSign(qrUrl);
                        if (this.stopped)
                            return;
                        // reset openId is mandatory, for scanning QR code triggering another oauth
                        this.ctx.openId = result.openId;
                        // race with QRType.result
                        if (result.success) {
                            this.onSuccess?.(result);
                        }
                    }
                    // manually print or execute command
                    switch (consts_1.qr.mode) {
                        case 'terminal': {
                            console.log(await qrcode_1.toString(this.currentQRUrl, { type: 'terminal' }));
                            break;
                        }
                        case 'copy': {
                            utils_1.copyToClipBoard(this.currentQRUrl);
                        }
                        case 'plain': {
                            console.log(this.currentQRUrl);
                            break;
                        }
                        default:
                            break;
                    }
                    break;
                }
                case QRType.result: {
                    const { student } = data;
                    // TODO: get student info from devtools
                    if (student && student.name === this.ctx.studentName) {
                        this.onSuccess?.(student);
                    }
                    break;
                }
                default:
                    break;
            }
        };
        this.handleMessage = (data) => {
            if (this.stopped)
                return;
            try {
                const messages = JSON.parse(data);
                // heartbeat response
                if (Array.isArray(messages) && messages.length === 0) {
                    return;
                }
                const message = messages[0];
                const { channel, successful } = message;
                if (!successful) {
                    // qr subscription
                    if (QRSign.testQRSubscription(message)) {
                        debugLogger(`${channel}: successful!`);
                        this.handleQRSubscription(message).catch(this.fail);
                    }
                    else {
                        throw new status_1.AppError('action', '二维码订阅被服务拒绝，无法确定是授权还是接口问题。', status_1.fallbackActions);
                    }
                }
                else {
                    debugLogger(`${channel}: successful!`);
                    switch (message.channel) {
                        case '/meta/handshake': {
                            const { clientId } = message;
                            this.clientId = clientId;
                            this.connect();
                            break;
                        }
                        case '/meta/connect': {
                            const { advice: { timeout }, } = message;
                            this.startHeartbeat(timeout);
                            this.subscribe();
                            break;
                        }
                        case '/meta/subscribe': {
                            break;
                        }
                        default: {
                            break;
                        }
                    }
                }
            }
            catch (err) {
                this.fail(err);
            }
        };
        this.handshake = () => this.sendMessage({
            channel: '/meta/handshake',
            version: '1.0',
            supportedConnectionTypes: [
                'websocket',
                'eventsource',
                'long-polling',
                'cross-origin-long-polling',
                'callback-polling',
            ],
            id: this.seqId,
        });
        this.connect = () => {
            this.sendMessage({
                channel: '/meta/connect',
                clientId: this.clientId,
                connectionType: 'websocket',
                id: this.seqId,
            });
        };
        this.startHeartbeat = (timeout) => {
            if (!Number.isFinite(timeout) || timeout < 1000) {
                this.fail(new status_1.AppError('action', '二维码服务返回异常心跳参数。', status_1.fallbackActions));
                return;
            }
            if (this.interval)
                clearInterval(this.interval);
            this.sendMessage();
            if (this.stopped)
                return;
            this.interval = setInterval(() => {
                this.sendMessage();
                this.connect();
            }, timeout / 2);
        };
        this.subscribe = () => this.sendMessage({
            channel: '/meta/subscribe',
            clientId: this.clientId,
            subscription: `/attendance/${this.courseId}/${this.signId}/qr`,
            id: this.seqId,
        });
        this.courseId = info.courseId;
        this.signId = info.signId;
        this.ctx = ctx;
    }
    startSync(cb, err) {
        this.onError = err ?? null;
        this.onSuccess = cb ?? null;
        this.stopped = false;
        this.client = new ws_1.default(QRSign.endpoint, { handshakeTimeout: 15000 });
        this.client.on('open', () => {
            this.handshake();
        });
        this.client.on('message', (data) => {
            debugLogger(`receiveMessage`, data);
            this.handleMessage(data.toString());
        });
        this.client.on('error', this.fail);
        this.client.on('close', () => {
            this.fail(new status_1.AppError('temporary', '二维码连接已断开，将重新订阅。'));
        });
    }
    destory() {
        this.stopped = true;
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = undefined;
        }
        this.client?.close();
    }
    // getters
    get seqId() {
        return `${this._seqId++}`;
    }
}
exports.QRSign = QRSign;
// static
QRSign.endpoint = 'wss://www.teachermate.com.cn/faye';
QRSign.testQRSubscription = (msg) => /attendance\/\d+\/\d+\/qr/.test(msg.channel);
