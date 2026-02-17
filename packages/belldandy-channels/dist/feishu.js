"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeishuChannel = void 0;
var lark = require("@larksuiteoapi/node-sdk");
/**
 * 飞书渠道实现
 * 使用 WebSocket 长连接模式，无需公网 IP
 */
var FeishuChannel = /** @class */ (function () {
    function FeishuChannel(config) {
        /** 渠道名称 */
        this.name = "feishu";
        this._running = false;
        // Deduplication: track processed message IDs to avoid responding multiple times
        this.processedMessages = new Set();
        this.MESSAGE_CACHE_SIZE = 1000;
        this.agent = config.agent;
        this.conversationStore = config.conversationStore;
        this.agentId = config.agentId;
        // HTTP Client for sending messages
        this.client = new lark.Client({
            appId: config.appId,
            appSecret: config.appSecret,
        });
        // WebSocket Client for receiving events
        this.wsClient = new lark.WSClient({
            appId: config.appId,
            appSecret: config.appSecret,
            loggerLevel: lark.LoggerLevel.info,
        });
        // Store callback
        this.onChatIdUpdate = config.onChatIdUpdate;
        this.sttTranscribe = config.sttTranscribe;
        // setupEventHandlers was removed
        if (config.initialChatId) {
            this.lastChatId = config.initialChatId;
            console.log("Feishu: Restored last chat ID: ".concat(this.lastChatId));
        }
    }
    Object.defineProperty(FeishuChannel.prototype, "isRunning", {
        /** 渠道是否正在运行 */
        get: function () {
            return this._running;
        },
        enumerable: false,
        configurable: true
    });
    FeishuChannel.prototype.start = function () {
        return __awaiter(this, void 0, void 0, function () {
            var eventDispatcher;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this._running)
                            return [2 /*return*/];
                        eventDispatcher = new lark.EventDispatcher({}).register({
                            "im.message.receive_v1": function (data) { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, this.handleMessage(data)];
                                        case 1:
                                            _a.sent();
                                            return [2 /*return*/];
                                    }
                                });
                            }); },
                        });
                        // Start WS connection with the dispatcher
                        return [4 /*yield*/, this.wsClient.start({
                                eventDispatcher: eventDispatcher,
                            })];
                    case 1:
                        // Start WS connection with the dispatcher
                        _a.sent();
                        this._running = true;
                        console.log("[".concat(this.name, "] WebSocket Channel started."));
                        return [2 /*return*/];
                }
            });
        });
    };
    FeishuChannel.prototype.stop = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (!this._running)
                    return [2 /*return*/];
                try {
                    // Note: @larksuiteoapi/node-sdk WSClient 目前没有公开的 stop/close 方法
                    // 如果未来 SDK 支持，可以在这里调用
                    // await this.wsClient.stop();
                    this._running = false;
                    this.processedMessages.clear();
                    console.log("[".concat(this.name, "] Channel stopped."));
                }
                catch (e) {
                    console.error("[".concat(this.name, "] Error stopping channel:"), e);
                    throw e;
                }
                return [2 /*return*/];
            });
        });
    };
    FeishuChannel.prototype.handleMessage = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var message, sender, chatId, msgId, firstKey, text, contentObj, fileKey, response, buffer, chunks, _a, _b, _c, chunk, e_1_1, chunks, stream, mime, sttRes, e_2, history, runInput, stream, replyText, _d, stream_1, stream_1_1, item, e_3_1, sanitized, e_4;
            var _e, e_1, _f, _g, _h, e_3, _j, _k;
            var _l, _m, _o, _p, _q, _r;
            return __generator(this, function (_s) {
                switch (_s.label) {
                    case 0:
                        message = data.message;
                        sender = data.sender;
                        if (!message) {
                            console.error("Feishu: message object is undefined in event data", data);
                            return [2 /*return*/];
                        }
                        // Ignore updates, own messages, or system messages if needed
                        // Usually we check message_type
                        if (message.message_type !== "text" && message.message_type !== "audio") {
                            // For now, only handle text and audio
                            // TODO: Support images/files
                            return [2 /*return*/];
                        }
                        chatId = message.chat_id;
                        if (this.lastChatId !== chatId) {
                            this.lastChatId = chatId;
                            // Notify listener for persistence
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            (_l = this.onChatIdUpdate) === null || _l === void 0 ? void 0 : _l.call(this, chatId);
                        }
                        msgId = message.message_id;
                        // === Deduplication: skip if we've already processed this message ===
                        if (this.processedMessages.has(msgId)) {
                            console.log("Feishu: Skipping duplicate message ".concat(msgId));
                            return [2 /*return*/];
                        }
                        // Mark as processed immediately to prevent concurrent processing
                        this.processedMessages.add(msgId);
                        // Limit cache size to prevent memory leak
                        if (this.processedMessages.size > this.MESSAGE_CACHE_SIZE) {
                            firstKey = this.processedMessages.values().next().value;
                            if (firstKey)
                                this.processedMessages.delete(firstKey);
                        }
                        text = "";
                        _s.label = 1;
                    case 1:
                        _s.trys.push([1, 23, , 24]);
                        contentObj = JSON.parse(message.content);
                        if (!(message.message_type === "text")) return [3 /*break*/, 2];
                        text = contentObj.text;
                        return [3 /*break*/, 22];
                    case 2:
                        if (!(message.message_type === "audio")) return [3 /*break*/, 22];
                        if (!this.sttTranscribe) {
                            console.warn("Feishu: Received audio message ".concat(msgId, " but STT is not configured."));
                            return [2 /*return*/]; // Or send a reply saying voice is not supported
                        }
                        fileKey = contentObj.file_key;
                        console.log("Feishu: Downloading audio ".concat(fileKey, "..."));
                        return [4 /*yield*/, this.client.im.messageResource.get({
                                path: { message_id: msgId, file_key: fileKey },
                                params: { type: "file" }, // type: 'image' | 'file'
                            })];
                    case 3:
                        response = _s.sent();
                        buffer = void 0;
                        if (!Buffer.isBuffer(response)) return [3 /*break*/, 4];
                        buffer = response;
                        return [3 /*break*/, 20];
                    case 4:
                        if (!(response.data && typeof response.data.on === 'function')) return [3 /*break*/, 17];
                        chunks = [];
                        _s.label = 5;
                    case 5:
                        _s.trys.push([5, 10, 11, 16]);
                        _a = true, _b = __asyncValues(response.data);
                        _s.label = 6;
                    case 6: return [4 /*yield*/, _b.next()];
                    case 7:
                        if (!(_c = _s.sent(), _e = _c.done, !_e)) return [3 /*break*/, 9];
                        _g = _c.value;
                        _a = false;
                        chunk = _g;
                        chunks.push(Buffer.from(chunk));
                        _s.label = 8;
                    case 8:
                        _a = true;
                        return [3 /*break*/, 6];
                    case 9: return [3 /*break*/, 16];
                    case 10:
                        e_1_1 = _s.sent();
                        e_1 = { error: e_1_1 };
                        return [3 /*break*/, 16];
                    case 11:
                        _s.trys.push([11, , 14, 15]);
                        if (!(!_a && !_e && (_f = _b.return))) return [3 /*break*/, 13];
                        return [4 /*yield*/, _f.call(_b)];
                    case 12:
                        _s.sent();
                        _s.label = 13;
                    case 13: return [3 /*break*/, 15];
                    case 14:
                        if (e_1) throw e_1.error;
                        return [7 /*endfinally*/];
                    case 15: return [7 /*endfinally*/];
                    case 16:
                        buffer = Buffer.concat(chunks);
                        return [3 /*break*/, 20];
                    case 17:
                        if (!response.writeFile) return [3 /*break*/, 19];
                        chunks = [];
                        return [4 /*yield*/, ((_q = (_p = (_o = (_m = response.response).blob) === null || _o === void 0 ? void 0 : _o.call(_m)) === null || _p === void 0 ? void 0 : _p.stream) === null || _q === void 0 ? void 0 : _q.call(_p))];
                    case 18:
                        stream = _s.sent();
                        // Fallback:
                        buffer = Buffer.from(JSON.stringify(response)); // Error placeholder
                        return [3 /*break*/, 20];
                    case 19:
                        // Assume it's a buffer-like object or try to convert
                        buffer = Buffer.from(response);
                        _s.label = 20;
                    case 20:
                        if (buffer.length < 100) {
                            // Likely JSON error response
                            console.warn("Feishu: Audio download might be invalid (too small).");
                        }
                        mime = "audio/mp4";
                        return [4 /*yield*/, this.sttTranscribe({
                                buffer: buffer,
                                fileName: "feishu_".concat(msgId, ".m4a"),
                                mime: mime
                            })];
                    case 21:
                        sttRes = _s.sent();
                        if (sttRes === null || sttRes === void 0 ? void 0 : sttRes.text) {
                            text = sttRes.text;
                            console.log("Feishu: Audio transcribed: \"".concat(text, "\""));
                        }
                        else {
                            console.warn("Feishu: Audio transcription failed for ".concat(msgId, "."));
                            return [2 /*return*/];
                        }
                        _s.label = 22;
                    case 22: return [3 /*break*/, 24];
                    case 23:
                        e_2 = _s.sent();
                        console.error("Failed to parse Feishu message content or download audio", e_2);
                        return [2 /*return*/];
                    case 24:
                        // Ignore empty messages
                        if (!text)
                            return [2 /*return*/];
                        console.log("Feishu: Processing message ".concat(msgId, " from chat ").concat(chatId, ": \"").concat(text.slice(0, 50), "...\""));
                        // Run the agent
                        // We create a history context if possible, but for MVP we just send the text
                        // The agent is responsible for context via ConversationStore (not linked here yet)
                        // We pass conversationId as chatId
                        // [PERSISTENCE] Add User Message to Store
                        this.conversationStore.addMessage(chatId, "user", text, {
                            agentId: this.agentId,
                            channel: "feishu",
                        });
                        history = this.conversationStore.getHistory(chatId);
                        runInput = {
                            conversationId: chatId, // Map Feishu Chat ID to Conversation ID
                            text: text,
                            history: history, // Provide history context
                            // We could pass sender info in meta
                            meta: {
                                from: sender,
                                messageId: msgId,
                                channel: "feishu"
                            }
                        };
                        _s.label = 25;
                    case 25:
                        _s.trys.push([25, 41, , 43]);
                        stream = this.agent.run(runInput);
                        replyText = "";
                        _s.label = 26;
                    case 26:
                        _s.trys.push([26, 31, 32, 37]);
                        _d = true, stream_1 = __asyncValues(stream);
                        _s.label = 27;
                    case 27: return [4 /*yield*/, stream_1.next()];
                    case 28:
                        if (!(stream_1_1 = _s.sent(), _h = stream_1_1.done, !_h)) return [3 /*break*/, 30];
                        _k = stream_1_1.value;
                        _d = false;
                        item = _k;
                        if (item.type === "delta") {
                            // Streaming is tricky with Feishu unless we use "card" updates.
                            // For simplicity in MVP, we accumulate and send send/reply at the end.
                            replyText += item.delta;
                        }
                        else if (item.type === "final") {
                            replyText = item.text; // Ensure we get the final full text if provided
                        }
                        else if (item.type === "tool_call") {
                            console.log("Feishu: Tool call: ".concat(item.name), item.arguments);
                        }
                        else if (item.type === "tool_result") {
                            console.log("Feishu: Tool result: ".concat(item.name, " - success: ").concat(item.success), item.success ? (_r = item.output) === null || _r === void 0 ? void 0 : _r.slice(0, 100) : item.error);
                        }
                        _s.label = 29;
                    case 29:
                        _d = true;
                        return [3 /*break*/, 27];
                    case 30: return [3 /*break*/, 37];
                    case 31:
                        e_3_1 = _s.sent();
                        e_3 = { error: e_3_1 };
                        return [3 /*break*/, 37];
                    case 32:
                        _s.trys.push([32, , 35, 36]);
                        if (!(!_d && !_h && (_j = stream_1.return))) return [3 /*break*/, 34];
                        return [4 /*yield*/, _j.call(stream_1)];
                    case 33:
                        _s.sent();
                        _s.label = 34;
                    case 34: return [3 /*break*/, 36];
                    case 35:
                        if (e_3) throw e_3.error;
                        return [7 /*endfinally*/];
                    case 36: return [7 /*endfinally*/];
                    case 37:
                        if (!replyText) return [3 /*break*/, 39];
                        sanitized = replyText
                            .replace(/<audio[^>]*>.*?<\/audio>/gi, "")
                            .replace(/\[Download\]\([^)]*\/generated\/[^)]*\)/gi, "")
                            .replace(/\n{3,}/g, "\n\n")
                            .trim();
                        this.conversationStore.addMessage(chatId, "assistant", sanitized || replyText, {
                            agentId: this.agentId,
                            channel: "feishu",
                        });
                        return [4 /*yield*/, this.reply(msgId, replyText)];
                    case 38:
                        _s.sent();
                        console.log("Feishu: Repled to message ".concat(msgId));
                        return [3 /*break*/, 40];
                    case 39:
                        console.warn("Feishu: Agent returned empty response for message ".concat(msgId));
                        _s.label = 40;
                    case 40: return [3 /*break*/, 43];
                    case 41:
                        e_4 = _s.sent();
                        console.error("Error running agent for Feishu message:", e_4);
                        return [4 /*yield*/, this.reply(msgId, "Error: " + String(e_4))];
                    case 42:
                        _s.sent();
                        return [3 /*break*/, 43];
                    case 43: return [2 /*return*/];
                }
            });
        });
    };
    FeishuChannel.prototype.reply = function (messageId, content) {
        return __awaiter(this, void 0, void 0, function () {
            var e_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.client.im.message.reply({
                                path: {
                                    message_id: messageId,
                                },
                                data: {
                                    content: JSON.stringify({ text: content }),
                                    msg_type: "text",
                                },
                            })];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        e_5 = _a.sent();
                        console.error("Failed to reply to Feishu:", e_5);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 主动发送消息（非回复）
     * @param content - 消息内容
     * @param chatId - 可选，指定发送目标。不指定则发送到最后活跃的会话
     * @returns 是否发送成功
     */
    FeishuChannel.prototype.sendProactiveMessage = function (content, chatId) {
        return __awaiter(this, void 0, void 0, function () {
            var targetChatId, e_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        targetChatId = chatId || this.lastChatId;
                        if (!targetChatId) {
                            console.warn("[".concat(this.name, "] Cannot send proactive message - no active chat ID found."));
                            return [2 /*return*/, false];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.client.im.message.create({
                                params: {
                                    receive_id_type: "chat_id",
                                },
                                data: {
                                    receive_id: targetChatId,
                                    content: JSON.stringify({ text: content }),
                                    msg_type: "text",
                                },
                            })];
                    case 2:
                        _a.sent();
                        console.log("[".concat(this.name, "] Proactive message sent to ").concat(targetChatId));
                        return [2 /*return*/, true];
                    case 3:
                        e_6 = _a.sent();
                        console.error("[".concat(this.name, "] Failed to send proactive message:"), e_6);
                        return [2 /*return*/, false];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return FeishuChannel;
}());
exports.FeishuChannel = FeishuChannel;
