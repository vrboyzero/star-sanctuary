# Star Sanctuary Webhook 调用示例

配套配置文件：

- [webhooks.star-sanctuary.sample.json](/E:/project/star-sanctuary/docs/webhooks.star-sanctuary.sample.json)

使用前先确认：

1. 已将示例配置复制到 `C:\Users\admin\.star_sanctuary\webhooks.json`
2. 已把其中 3 条 webhook 的 `token` 替换为你自己的随机串
3. 已重启 Gateway

Windows PowerShell 下如果用 curl，建议用 `curl.exe`，避免命中 PowerShell 自带的 `curl` 别名。

## 1. 构建失败告警 -> coder

对应 rule：

- `id`: `build-failed-coder`
- `defaultAgentId`: `coder`

```bash
curl.exe -X POST http://127.0.0.1:28889/api/webhook/build-failed-coder ^
  -H "Authorization: Bearer replace-with-a-long-random-token-for-build-failed-coder" ^
  -H "Content-Type: application/json" ^
  -H "X-Idempotency-Key: build-failed-main-20260413-001" ^
  -d "{\"payload\":{\"project\":\"star-sanctuary\",\"branch\":\"main\",\"commit\":\"abc123def456\",\"job\":\"windows-build\",\"stage\":\"package\",\"summary\":\"pnpm build failed after dependency refresh\",\"logUrl\":\"https://ci.example.com/builds/20260413-001\"}}"
```

这条请求会把 payload 套进模板，交给 `coder` 处理。

## 2. 手动外部触发 coder

对应 rule：

- `id`: `manual-coder-task`
- `defaultAgentId`: `coder`

```bash
curl.exe -X POST http://127.0.0.1:28889/api/webhook/manual-coder-task ^
  -H "Authorization: Bearer replace-with-a-long-random-token-for-manual-coder-task" ^
  -H "Content-Type: application/json" ^
  -H "X-Idempotency-Key: manual-coder-20260413-001" ^
  -d "{\"payload\":{\"project\":\"star-sanctuary\",\"title\":\"检查 webchat 右侧面板回归\",\"goal\":\"定位为什么多 Agent 面板只显示 default，并给出最小修复方案\",\"constraints\":\"不要回退用户现有改动；优先最小 diff；先验证是否是后端 roster 问题\",\"files\":\"apps/web/public/app/features/agent-runtime.js, packages/belldandy-core/src/server-methods/agents-system.ts\",\"notes\":\"先检查 agents.roster.get 与前端 agent panel 渲染链路\"}}"
```

适合给外部脚本、CI 工作流、或你自己的自动化入口，直接派一条代码任务给 `coder`。

## 3. 手动外部触发 researcher

对应 rule：

- `id`: `manual-researcher-task`
- `defaultAgentId`: `researcher`

```bash
curl.exe -X POST http://127.0.0.1:28889/api/webhook/manual-researcher-task ^
  -H "Authorization: Bearer replace-with-a-long-random-token-for-manual-researcher-task" ^
  -H "Content-Type: application/json" ^
  -H "X-Idempotency-Key: manual-researcher-20260413-001" ^
  -d "{\"payload\":{\"project\":\"star-sanctuary\",\"title\":\"调研 webhook 安全加固方案\",\"goal\":\"梳理当前 webhook ingress guard 还缺哪些关键保护，并按优先级给出建议\",\"scope\":\"仅关注 /api/webhook/:id 入站保护、鉴权前限流、body size、并发限制、幂等\",\"deliverable\":\"输出结论、依据、风险、建议优先级\",\"notes\":\"优先基于仓库现有实现和 docs，不要发散到无关方向\"}}"
```

适合把偏分析、调研、方案整理类任务交给 `researcher`。

## 成功响应示例

```json
{
  "ok": true,
  "payload": {
    "webhookId": "manual-coder-task",
    "conversationId": "webhook:manual-coder-task:2026-04-13",
    "response": "..."
  }
}
```

## Invoke-RestMethod 版

### 1. 构建失败告警 -> coder

```powershell
$headers = @{
  Authorization       = "Bearer replace-with-a-long-random-token-for-build-failed-coder"
  "Content-Type"      = "application/json"
  "X-Idempotency-Key" = "build-failed-main-20260413-001"
}

$body = @{
  payload = @{
    project = "star-sanctuary"
    branch  = "main"
    commit  = "abc123def456"
    job     = "windows-build"
    stage   = "package"
    summary = "pnpm build failed after dependency refresh"
    logUrl  = "https://ci.example.com/builds/20260413-001"
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Method POST `
  -Uri "http://127.0.0.1:28889/api/webhook/build-failed-coder" `
  -Headers $headers `
  -Body $body
```

### 2. 手动外部触发 coder

```powershell
$headers = @{
  Authorization       = "Bearer replace-with-a-long-random-token-for-manual-coder-task"
  "Content-Type"      = "application/json"
  "X-Idempotency-Key" = "manual-coder-20260413-001"
}

$body = @{
  payload = @{
    project     = "star-sanctuary"
    title       = "检查 webchat 右侧面板回归"
    goal        = "定位为什么多 Agent 面板只显示 default，并给出最小修复方案"
    constraints = "不要回退用户现有改动；优先最小 diff；先验证是否是后端 roster 问题"
    files       = "apps/web/public/app/features/agent-runtime.js, packages/belldandy-core/src/server-methods/agents-system.ts"
    notes       = "先检查 agents.roster.get 与前端 agent panel 渲染链路"
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Method POST `
  -Uri "http://127.0.0.1:28889/api/webhook/manual-coder-task" `
  -Headers $headers `
  -Body $body
```

### 3. 手动外部触发 researcher

```powershell
$headers = @{
  Authorization       = "Bearer replace-with-a-long-random-token-for-manual-researcher-task"
  "Content-Type"      = "application/json"
  "X-Idempotency-Key" = "manual-researcher-20260413-001"
}

$body = @{
  payload = @{
    project     = "star-sanctuary"
    title       = "调研 webhook 安全加固方案"
    goal        = "梳理当前 webhook ingress guard 还缺哪些关键保护，并按优先级给出建议"
    scope       = "仅关注 /api/webhook/:id 入站保护、鉴权前限流、body size、并发限制、幂等"
    deliverable = "输出结论、依据、风险、建议优先级"
    notes       = "优先基于仓库现有实现和 docs，不要发散到无关方向"
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Method POST `
  -Uri "http://127.0.0.1:28889/api/webhook/manual-researcher-task" `
  -Headers $headers `
  -Body $body
```

## GitHub Actions 模板

适合在工作流失败、构建失败或巡检任务结束后，直接把上下文推给 `coder` 或 `researcher`。

```yaml
name: Notify Star Sanctuary

on:
  workflow_dispatch:
  workflow_run:
    workflows: ["Build"]
    types: [completed]

jobs:
  notify-coder-on-failure:
    if: ${{ github.event.workflow_run.conclusion == 'failure' || github.event_name == 'workflow_dispatch' }}
    runs-on: ubuntu-latest
    steps:
      - name: Send build failure webhook
        env:
          WEBHOOK_TOKEN: ${{ secrets.SS_WEBHOOK_BUILD_FAILED_CODER_TOKEN }}
        run: |
          curl -X POST http://127.0.0.1:28889/api/webhook/build-failed-coder \
            -H "Authorization: Bearer ${WEBHOOK_TOKEN}" \
            -H "Content-Type: application/json" \
            -H "X-Idempotency-Key: gha-${{ github.run_id }}-${{ github.run_attempt }}" \
            -d '{
              "payload": {
                "project": "${{ github.repository }}",
                "branch": "${{ github.ref_name }}",
                "commit": "${{ github.sha }}",
                "job": "github-actions-build",
                "stage": "workflow_run",
                "summary": "GitHub Actions workflow failed",
                "logUrl": "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
              }
            }'
```

如果 Gateway 不在本机，把 `http://127.0.0.1:28889` 换成你的实际可访问地址。

## n8n 模板

最简单的接法是一个 `HTTP Request` 节点直接调用 Gateway。

建议配置：

- Method: `POST`
- URL: `http://127.0.0.1:28889/api/webhook/manual-researcher-task`
- Authentication: `None`
- Send Headers: `true`
- Headers:
  - `Authorization`: `Bearer replace-with-a-long-random-token-for-manual-researcher-task`
  - `Content-Type`: `application/json`
  - `X-Idempotency-Key`: `n8n-{{$execution.id}}`
- Send Body: `JSON`

Body 示例：

```json
{
  "payload": {
    "project": "star-sanctuary",
    "title": "调研第三方服务异常",
    "goal": "分析最近 webhook 调用失败是否和上游服务变更有关",
    "scope": "只看最近一周的 webhook 触发与失败摘要",
    "deliverable": "给出结论、证据和建议动作",
    "notes": "如果上游返回码集中为 401/403，请单列风险"
  }
}
```

如果你用的是 n8n 表达式，也可以这样写：

```json
{
  "payload": {
    "project": "star-sanctuary",
    "title": "{{$json.title}}",
    "goal": "{{$json.goal}}",
    "scope": "{{$json.scope}}",
    "deliverable": "{{$json.deliverable}}",
    "notes": "{{$json.notes}}"
  }
}
```

## Jenkins 模板

适合在 Pipeline 失败后把构建上下文推给 `coder`。

```groovy
pipeline {
  agent any

  stages {
    stage('Build') {
      steps {
        bat 'corepack pnpm build'
      }
    }
  }

  post {
    failure {
      withCredentials([string(credentialsId: 'ss-webhook-build-failed-coder-token', variable: 'WEBHOOK_TOKEN')]) {
        bat """
curl.exe -X POST http://127.0.0.1:28889/api/webhook/build-failed-coder ^
  -H "Authorization: Bearer %WEBHOOK_TOKEN%" ^
  -H "Content-Type: application/json" ^
  -H "X-Idempotency-Key: jenkins-%BUILD_TAG%" ^
  -d "{\\"payload\\":{\\"project\\":\\"star-sanctuary\\",\\"branch\\":\\"%BRANCH_NAME%\\",\\"commit\\":\\"%GIT_COMMIT%\\",\\"job\\":\\"%JOB_NAME%\\",\\"stage\\":\\"build\\",\\"summary\\":\\"Jenkins pipeline failed\\",\\"logUrl\\":\\"%BUILD_URL%console\\"}}"
"""
      }
    }
  }
}
```

如果 Jenkins 跑在 Linux 节点，把 `curl.exe` 换成 `curl`，并把转义改成 shell 风格即可。

## PowerShell 脚本版

适合你在 Windows 本地留一个可复用脚本，比如 `scripts/send-ss-webhook.ps1`。

```powershell
param(
  [Parameter(Mandatory = $true)]
  [string]$WebhookId,

  [Parameter(Mandatory = $true)]
  [string]$Token,

  [Parameter(Mandatory = $false)]
  [string]$GatewayBaseUrl = "http://127.0.0.1:28889",

  [Parameter(Mandatory = $false)]
  [string]$IdempotencyKey = "",

  [Parameter(Mandatory = $false)]
  [string]$Text = "",

  [Parameter(Mandatory = $false)]
  [string]$AgentId = "",

  [Parameter(Mandatory = $false)]
  [string]$ConversationId = "",

  [Parameter(Mandatory = $false)]
  [string]$PayloadJson = ""
)

$headers = @{
  Authorization  = "Bearer $Token"
  "Content-Type" = "application/json"
}

if ($IdempotencyKey) {
  $headers["X-Idempotency-Key"] = $IdempotencyKey
}

$body = @{}
if ($Text) {
  $body.text = $Text
}
if ($AgentId) {
  $body.agentId = $AgentId
}
if ($ConversationId) {
  $body.conversationId = $ConversationId
}
if ($PayloadJson) {
  $body.payload = $PayloadJson | ConvertFrom-Json
}

$json = $body | ConvertTo-Json -Depth 8

Invoke-RestMethod `
  -Method POST `
  -Uri "$GatewayBaseUrl/api/webhook/$WebhookId" `
  -Headers $headers `
  -Body $json
```

调用示例：

```powershell
.\send-ss-webhook.ps1 `
  -WebhookId "manual-coder-task" `
  -Token "replace-with-a-long-random-token-for-manual-coder-task" `
  -IdempotencyKey "manual-coder-20260413-002" `
  -PayloadJson '{"project":"star-sanctuary","title":"检查 memory 日志噪音","goal":"判断是否需要减少 file_read miss 的工具噪音","constraints":"只做最小分析，不扩改","files":"packages/belldandy-core/src","notes":"优先看日志与现有处理"}'
```

如果你想发纯文本，也可以：

```powershell
.\send-ss-webhook.ps1 `
  -WebhookId "manual-researcher-task" `
  -Token "replace-with-a-long-random-token-for-manual-researcher-task" `
  -Text "请整理最近 webhook / cron / community 的剩余风险项"
```

## Python 调用版

适合本地脚本、自动化守护进程、简单服务集成。

```python
import json
import requests

gateway_base_url = "http://127.0.0.1:28889"
webhook_id = "manual-researcher-task"
token = "replace-with-a-long-random-token-for-manual-researcher-task"

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json",
    "X-Idempotency-Key": "python-manual-researcher-20260413-001",
}

payload = {
    "payload": {
        "project": "star-sanctuary",
        "title": "调研模型 provider 诊断增强",
        "goal": "梳理 models advanced 还缺哪些高价值诊断能力",
        "scope": "只关注 provider/protocol/catalog/picker 相关体验",
        "deliverable": "输出结论、建议优先级和风险",
        "notes": "优先基于现有 docs 和 belldandy-core 代码"
    }
}

response = requests.post(
    f"{gateway_base_url}/api/webhook/{webhook_id}",
    headers=headers,
    data=json.dumps(payload),
    timeout=60,
)

print(response.status_code)
print(response.json())
```

如果你环境里还没有 `requests`：

```bash
pip install requests
```

## Node 调用版

适合 Node 脚本、构建脚本、外部服务接入。

```js
const gatewayBaseUrl = "http://127.0.0.1:28889";
const webhookId = "manual-coder-task";
const token = "replace-with-a-long-random-token-for-manual-coder-task";

const body = {
  payload: {
    project: "star-sanctuary",
    title: "检查多 Agent roster 回归",
    goal: "确认 agents.json 与右侧 Agent 面板是否仍然一致",
    constraints: "优先最小验证，不要先动大改",
    files: "packages/belldandy-core/src/server-methods/agents-system.ts, apps/web/public/app/features/agent-runtime.js",
    notes: "如果 roster 已正确返回，就再看前端渲染"
  }
};

const response = await fetch(`${gatewayBaseUrl}/api/webhook/${webhookId}`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Idempotency-Key": "node-manual-coder-20260413-001",
  },
  body: JSON.stringify(body),
});

const result = await response.json();
console.log(response.status, result);
```

如果你想兼容更老的 Node 版本，没有全局 `fetch`，可以改用 `axios` 或 `node-fetch`。

## 常见问题

### 401 Unauthorized

- `Authorization` 里的 Bearer token 不对
- `webhooks.json` 改完后 Gateway 没重启

### 404 Not Found

- URL 里的 webhook id 不存在
- 例如应为 `/api/webhook/manual-coder-task`，不是别的 path

### 触发了但 Agent 不对

- 检查 `webhooks.json` 里的 `defaultAgentId`
- 如果请求体里显式传了 `agentId`，会覆盖 rule 默认值

### 想直接发纯文本，不走模板

也可以直接传 `text`：

```bash
curl.exe -X POST http://127.0.0.1:28889/api/webhook/manual-coder-task ^
  -H "Authorization: Bearer replace-with-a-long-random-token-for-manual-coder-task" ^
  -H "Content-Type: application/json" ^
  -d "{\"text\":\"请检查 packages/belldandy-core/src/server.ts 里 webhook 入口的最近改动风险\"}"
```
