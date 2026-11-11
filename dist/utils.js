"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeDebugLogger = exports.debugLogger = exports.urlParamsToObject = exports.sendNotificaition = exports.extractOpenId = exports.sleep = exports.copyToClipBoard = void 0;
const child_process_1 = require("child_process");
const node_notifier_1 = require("node-notifier");
const consts_1 = require("./consts");
const placeholder = '{}';
exports.copyToClipBoard = (text) => {
    if (!text || !consts_1.config.clipboard?.copy)
        return;
    const copyCmd = consts_1.config.clipboard.copy;
    if (copyCmd.includes(placeholder)) {
        child_process_1.execSync(copyCmd.replace(placeholder, `"${text}"`));
    }
    else {
        throw 'wrong format for copyCmd!';
    }
};
exports.sleep = (ms) => new Promise((reslove) => {
    setTimeout(reslove, ms);
});
var openid_1 = require("./openid");
Object.defineProperty(exports, "extractOpenId", { enumerable: true, get: function () { return openid_1.extractOpenId; } });
exports.sendNotificaition = (message) => node_notifier_1.notify({ message, title: 'yatm' });
exports.urlParamsToObject = (urlParams) => Object.fromEntries(new URLSearchParams(urlParams));
// verbose
exports.debugLogger = (...args) => consts_1.config.verbose && console.debug(...args);
exports.makeDebugLogger = (prefix) => (...args) => exports.debugLogger(prefix, ...args);
