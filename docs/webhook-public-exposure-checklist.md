# Webhook 公网暴露前最小安全清单

适用场景：

- 你准备把 `Star Sanctuary` 的 webhook 入口暴露到公网
- 或准备让外部 CI / 第三方服务 / 自动化平台直接访问 `/api/webhook/:id`

这份清单只覆盖最小安全底线，不等于完整的生产安全方案。

相关资料：

- [webhook.md](/E:/project/star-sanctuary/docs/webhook.md)
- [安全变量配置建议方案.md](/E:/project/star-sanctuary/docs/安全变量配置建议方案.md)
- [config.ts](/E:/project/star-sanctuary/packages/belldandy-core/src/webhook/config.ts)
- [auth.ts](/E:/project/star-sanctuary/packages/belldandy-core/src/webhook/auth.ts)
- [request-guards.ts](/E:/project/star-sanctuary/packages/belldandy-core/src/webhook/request-guards.ts)

## 先说结论

如果你只是自己本机或内网用：

- 不建议直接公网暴露
- 优先保持 `BELLDANDY_HOST=127.0.0.1`
- 更推荐通过反向代理、VPN、隧道或专门的中转层接入

如果你确实要公网暴露，至少把下面这些项全部过一遍。

## 1. 暴露面

- 确认你暴露的是明确需要的入口，而不是整套 Gateway 都裸露在公网
- 如果只是给外部系统打 webhook，优先通过反向代理只转发 `/api/webhook/*`
- 不要顺手把 WebChat、WS、`/api/message`、静态资源一起公开出去

最低建议：

- Gateway 仍监听本机
- 由 Nginx / Caddy / Cloudflare Tunnel / Tailscale Funnel 之类的外层入口做代理

## 2. 传输层

- 必须走 HTTPS
- 不要让公网调用方直接用明文 HTTP 访问 webhook
- 证书终止可以放在反向代理层，但外部访问必须是 TLS

## 3. Token

- 每条 webhook 使用独立强随机 token
- 不要复用 WebChat / Gateway 的主 token
- 不要把 token 写进仓库、截图、日志、群消息或工单正文
- token 至少按“泄露即轮换”的标准管理

当前实现里，真正的 webhook 密钥在 `webhooks.json`，不是 `.env`。

## 4. Rule 最小化

- 只保留真正需要对外开放的 webhook rule
- 暂时不用的 rule 设为 `enabled: false` 或直接删掉
- `defaultAgentId` 只指向你明确允许被公网事件唤醒的 Agent

建议：

- 构建告警、监控告警、手动触发分成不同 rule
- 不同 rule 用不同 token

## 5. Agent 权限

- 公网 webhook 默认不要绑定“权限最大”的 Agent
- 如果某个 Agent 开了高风险工具，确认这是否真的允许被外部事件触发
- 特别检查是否开启了 `run_command`

如果当前有：

- `BELLDANDY_TOOLS_ENABLED=true`
- `BELLDANDY_DANGEROUS_TOOLS_ENABLED=true`

那么公网 webhook 的风险会明显上升。

## 6. 反向代理 / 上游限制

- 优先做来源 IP 白名单
- 至少做基础限流
- 尽量只允许可信平台出口访问

常见例子：

- GitHub Actions / GitHub Webhook：限制 GitHub 出口 IP 或在中转层校验来源
- n8n / Jenkins：只允许公司出口 IP 或 VPN 内地址访问

如果做不到 IP 白名单，至少要有：

- HTTPS
- 独立强 token
- 反向代理层限流

## 7. 当前内建防护你要知道它做了什么

当前 webhook 已内建这些基础防护：

- Bearer token 校验
- 恒定时间字符串比较，降低时序泄露风险
- 只接受 JSON Content-Type
- 鉴权前 body 限额
- 鉴权前 body 读取超时
- 基础 rate limit / in-flight 并发限制
- `X-Idempotency-Key` 幂等窗口去重

当前默认读取限制可从实现看到：

- pre-auth body 上限约 `64 KB`
- pre-auth body 超时约 `5s`
- post-auth body 上限约 `1 MB`
- post-auth body 超时约 `30s`

但这不代表可以不做外层防护。

## 8. 当前内建防护没有替代这些事

- 不能替代 HTTPS
- 不能替代公网入口的限流策略
- 不能替代来源 IP 控制
- 不能替代 WAF / 反向代理日志
- 不能替代 token 轮换
- 不能替代最小权限 Agent 设计

也就是说：

- 内建 guard 是最后一道应用层防线
- 不是公网暴露的全部安全方案

## 9. 日志与回显

- 不要在 webhook 调用脚本里打印完整 token
- 不要在 CI 日志里回显 Authorization 头
- 检查反向代理和应用日志，避免记录敏感 header
- 对外部平台的失败告警，只返回必要错误，不要暴露内部细节

## 10. 幂等与重试

- 外部平台如果会自动重试，尽量传 `X-Idempotency-Key`
- 同一事件必须复用同一个幂等键
- 不要每次重试都生成新 key，否则会变成重复执行

建议做法：

- GitHub Actions：用 `run_id + run_attempt`
- Jenkins：用 `BUILD_TAG`
- n8n：用执行 ID 或业务事件 ID
- 自己的脚本：用稳定事件主键

## 11. 配置文件安全

- `webhooks.json` 放在 state dir 下
- 不要放进 Git 仓库
- 不要放共享目录、桌面同步盘、公共网盘
- 权限尽量只给运行用户可读

## 12. 上线前最小自测

至少做这 6 条：

1. 正确 token 请求一次，确认返回 `200`
2. 错误 token 请求一次，确认返回 `401`
3. 缺少 `Authorization` 请求一次，确认返回 `401`
4. 用非 JSON Content-Type 请求一次，确认返回 `415`
5. 同一个 `X-Idempotency-Key` 连续发两次，确认不会重复执行
6. 查看日志，确认没有把 token 明文打出来

## 13. 更稳妥的推荐部署方式

推荐顺序：

1. `BELLDANDY_HOST=127.0.0.1`
2. 本机 Gateway 不直接暴露公网
3. 通过反向代理只暴露 `/api/webhook/*`
4. 反向代理层启用 HTTPS
5. 反向代理层做来源 IP 限制和限流
6. webhook rule 使用独立 token

这是比“直接把 28889 端口裸露到公网”稳得多的方案。

## 14. 不建议直接公网暴露的情况

如果命中下面任一项，先不要暴露：

- 你还在使用默认或短 token
- 你不清楚当前哪些 Agent 开了危险工具
- 你无法控制来源 IP
- 你没有 HTTPS
- 你没有幂等策略
- 你会把完整请求头打进日志
- 你只是临时试验，没有准备好后续轮换和回收

## 15. 一页式检查结论

可以考虑上线的最低条件：

- 只暴露 webhook 路径，不暴露整套 Gateway
- HTTPS 已就绪
- 每条 webhook 独立强随机 token
- 反向代理层有限流
- 最好有来源 IP 白名单
- 目标 Agent 权限经过检查
- 已验证 401 / 415 / 幂等 / 日志不泄密

如果以上有任一项明显缺失，建议先收口再暴露。
