---
name: skill-creator
description: 创建、编辑和打包 Agent 技能（SKILL.md），包括脚本、引用资源和目录结构。适用于从零构建新技能或迭代已有技能的场景。
version: "1.2"
tags: [skill, create, 技能, 创建, 编写, 打包, SKILL.md, authoring]
priority: normal
---

> ⚠️ **前置要求**：使用本技能前，建议先通读 **skill-judge** 技能了解以下基础概念：
> - Skills 的定义与三层结构（Layer 1/2/3）
> - 核心设计原则（知识增量、渐进式披露、自由度校准）
> - 评估维度（D1-D8）
> - 这些概念在本技能中不再重复，避免知识冗余。

# Skill Creator

创建高质量 Agent 技能的实践指南。

## 核心原则

### 知识增量优先

技能的价值在于提供 **Claude 不知道的知识**。在编写前问自己：

- ❌ "这个概念需要解释吗？" → Claude 可能已经知道
- ❌ "这个步骤需要详细说明吗？" → Claude 可能已经会做
- ✅ "这个决策树 Claude 自己能推理出来吗？" → 可能不会，需要 explicit
- ✅ "这个踩坑经验 Claude 踩过吗？" → 大概率没有，这是 expert-only

### 渐进式披露

技能加载有三层：

| 层级 | 内容 | 加载时机 |
|------|------|----------|
| Layer 1 | name + description | 始终在内存中 (~100 tokens) |
| Layer 2 | SKILL.md body | 触发后加载 (< 500 行最佳) |
| Layer 3 | references/, scripts/, assets/ | 按需加载 (无限制) |

**原则**：SKILL.md 只放核心路由和决策树，详细内容移到 references/。

### 自由度校准

根据任务特性选择自由度：

| 任务类型 | 自由度 | 示例 |
|----------|--------|------|
| 创意/设计 | 高 | "选择一个极端风格：极简/赛博/复古..." |
| 复杂多步骤 | 中 | "优先级：安全 > 逻辑 > 性能 > 可维护性" |
| 精确文件操作 | 低 | "必须使用 scripts/rotate.py，不修改参数" |

---

## 技能创建流程

### Step 1: 理解需求

跳过此步骤的前提：已明确技能的使用模式。

通过具体示例理解技能应该做什么：

- 用户会说什么来触发这个技能？
- 技能需要支持哪些具体功能？
- 有哪些边界情况需要处理？

**关键问题示例**：
- "这个技能主要做什么？"
- "用户说什么会触发这个技能？"
- "有什么典型场景？"

### Step 2: 规划资源

根据示例分析需要哪些可复用资源：

| 资源类型 | 使用场景 | 示例 |
|----------|----------|------|
| scripts/ | 需要确定性执行 | PDF 旋转、批量重命名 |
| references/ | 需要详细参考文档 | API 文档、schema 定义 |
| assets/ | 需要模板或静态资源 | Logo、HTML 模板 |

### Step 3: 初始化技能

使用 init_skill.py 创建技能骨架：

```bash
# 基础初始化
scripts/init_skill.py <skill-name> --path skills/public

# 指定资源目录
scripts/init_skill.py my-skill --path skills/public --resources scripts,references

# 包含示例
scripts/init_skill.py my-skill --path skills/public --resources scripts --examples
```

### Step 4: 编辑技能

#### 编写 Frontmatter

```yaml
---
name: my-skill
description: "技能描述：说明做什么 + 何时使用 + 触发关键词。
使用场景：(1) 场景A, (2) 场景B, (3) 场景C"
---
```

**description 编写要点**：
- 回答 WHAT：技能功能
- 回答 WHEN：触发场景（用 "(1)", "(2)" 列举）
- 包含关键词：文件格式、领域术语

**❌ 错误示例**：
```yaml
description: "帮助处理文档的技能"
```

**✅ 正确示例**：
```yaml
description: "PDF 文档处理：旋转、提取文本、合并分割。使用场景：
(1) 用户需要旋转 PDF 页面, (2) 提取 PDF 中的文字内容,
(3) 合并多个 PDF 文件, (4) 分割 PDF 为单页"
```

#### 编写 SKILL.md Body

**结构建议**：
1. 快速开始（核心命令/流程）
2. 决策树（何时用什么方法）
3. 参考指引（references/ 何时加载）
4. 反模式（NEVER 列表）

### Step 5: 打包技能

```bash
# 打包到当前目录
scripts/package_skill.py <path/to/skill-folder>

# 指定输出目录
scripts/package_skill.py <path/to/skill-folder> ./dist
```

打包脚本会自动验证：
- YAML frontmatter 格式
- 技能命名规范
- 目录结构
- 引用完整性

### Step 6: 迭代

基于使用反馈持续改进：
- 是否有知识增量不足的地方？
- 触发是否准确？
- references 是否被正确加载？

---

## 反模式 (NEVER List)

创建技能时 **绝对避免** 的错误：

### 1. 把技能写成教程

```markdown
# 什么是 PDF
PDF (Portable Document Format) 是...
# Python 基础
Python 是一种高级编程语言...
```

**问题**：Claude 已经知道这些基础概念。

**正确做法**：只保留 expert-only 知识（决策树、trade-offs、踩坑经验）。

---

### 2. 把所有内容塞进 SKILL.md

```markdown
# SKILL.md (800+ 行)
- 完整 API 文档
- 50 个使用示例
- 详细故障排除
- ...全部堆在一起
```

**问题**：超过 500 行，context bloat。

**正确做法**：内容拆分到 references/，SKILL.md 只保留路由和决策树。

---

### 3. 触发信息放在 Body 而非 Description

```markdown
---
name: pdf-skill
description: "PDF 处理技能"
---
# 何时使用这个技能
当用户需要处理 PDF 文件时使用...
```

**问题**：Body 只在触发后才加载，Agent 看不到"何时使用"。

**正确做法**：所有触发信息放在 description 字段。

---

### 4. 冗余的文件结构

```
skill-name/
├── SKILL.md
├── README.md              ❌ 不需要
├── CHANGELOG.md           ❌ 不需要
├── INSTALLATION.md        ❌ 不需要
├── CONTRIBUTING.md        ❌ 不需要
└── references/
    └── USAGE.md          ❌ 与 SKILL.md 重复
```

**问题**：不必要的辅助文件增加混乱。

**正确做法**：只保留 SKILL.md + 必要的 resources。

---

### 5. 模糊的 Description

```yaml
description: "有用的技能"
description: "处理各种任务"
```

**问题**：Agent 不知道何时触发这个技能。

**正确做法**：
- 明确 WHAT（做什么）
- 明确 WHEN（何时用）
- 包含 KEYWORDS（触发词）

---

### 6. 自由度错配

| 场景 | 错误做法 | 正确做法 |
|------|----------|----------|
| 创意设计 | 给出固定脚本 | "选择一个方向：极简/赛博/复古..." |
| 文件操作 | "选择合适的工具" | "必须使用 scripts/rotate.py" |

**问题**：创意任务需要高自由度，精确操作需要低自由度。

---

### 7. 没有加载触发

```markdown
## References
- api.md
- examples.md
- troubleshooting.md
```

**问题**：references 存在但 Agent 不知道何时加载。

**正确做法**：
```markdown
### 创建文档
MANDATORY: 先读取 [CREATE.md](CREATE.md) 完整内容
DO NOT_LOAD: 不要读取 advanced.md
```

---

### 8. Generic 反模式

```markdown
NEVER:
- 避免错误
- 小心处理
- 考虑边界情况
```

**问题**：说了等于没说。

**正确做法**：
```markdown
NEVER:
- 使用紫色渐变白底 → AI 生成感太强
- 使用 Inter/Roboto 字体 → 已被用滥
- 默认 border-radius → 缺乏设计感
```

---

## 快速检查清单

```
创建前：
  [ ] 有具体的使用示例吗？
  [ ] Claude 需要知道什么它不知道的知识？

编写中：
  [ ] description 回答了 WHAT + WHEN + KEYWORDS？
  [ ] SKILL.md < 500 行？
  [ ] 详细内容在 references/？
  [ ] 有明确的加载触发？
  [ ] 有 NEVER 列表？

完成后：
  [ ] 删除了 README/CHANGELOG 等辅助文件？
  [ ] 触发了 package_skill.py 验证？
```

---

## 与 Skill Judge 的区别

| 维度 | skill-creator | skill-judge |
|------|---------------|--------------|
| 视角 | 创建者（如何构建） | 评估者（如何评判） |
| 核心内容 | 6 步创建流程 | 8 维评估标准 |
| 独有 | init/package 工具、命名规范 | 评估协议、失败模式、NEVER Do 清单 |
| 重点 | "如何做好" | "什么是好" |

两个技能互补使用：创建时参考 skill-creator，创建后用 skill-judge 自评。
