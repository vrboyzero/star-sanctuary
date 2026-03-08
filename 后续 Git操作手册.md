# 后续 Git 操作手册

> 适用对象：当前 `E:\project\belldandy` 仓库维护者  
> 更新日期：2026-03-08

---

## 1. 当前 Git 远程状态

当前仓库采用 **双远程结构**：

- `origin`：旧仓库  
  `https://github.com/vrboyzero/Belldandy.git`
- `star`：新仓库  
  `https://github.com/vrboyzero/star-sanctuary.git`

当前分支跟踪关系：

- 本地 `main` → `star/main`

这意味着：

- 你现在直接执行 `git push`，默认会优先推送到 `star`
- 你现在直接执行 `git pull`，默认会优先从 `star` 拉取
- 旧仓库 `origin` 仍然保留，但不会作为当前 `main` 的默认上游

---

## 2. 为什么保留双远程

当前保留双远程的意义是：

- **新仓库 `star`**：作为后续正式发布与持续开发的主仓库
- **旧仓库 `origin`**：作为历史引用、比对、兜底或临时同步用途

这样做的好处：

- 不会一下子切断旧仓库联系
- 允许你逐步把工作重心迁移到新仓库
- 遇到需要对比、回看、临时补推时仍有操作空间

---

## 3. 日常最常用命令

### 3.1 查看当前远程

```bash
git remote -v
```

### 3.2 查看当前分支跟踪关系

```bash
git branch -vv
```

### 3.3 推送当前分支到默认上游（现在是 `star/main`）

```bash
git push
```

### 3.4 从默认上游拉取（现在是 `star/main`）

```bash
git pull
```

---

## 4. 明确推送到哪个远程

虽然当前默认上游已经是 `star/main`，但为了避免误操作，很多关键场景仍建议显式写远程名。

### 4.1 推送到新仓库 `star`

```bash
git push star main
```

### 4.2 从新仓库 `star` 拉取

```bash
git pull star main
```

### 4.3 推送到旧仓库 `origin`

```bash
git push origin main
```

### 4.4 从旧仓库 `origin` 拉取

```bash
git pull origin main
```

建议：

- **日常开发 / 新版本推进**：优先使用 `star`
- **历史保留 / 特殊同步**：按需使用 `origin`

---

## 5. 推荐工作流

### 方案 A：以后以 `star` 为主（推荐）

适用场景：

- 后续正式发布都准备走 `Star Sanctuary`
- 旧仓库只保留，不再作为主开发入口

建议操作方式：

```bash
git status
git add -A
git commit -m "feat: xxx"
git push
```

因为当前 `main` 已跟踪 `star/main`，所以这里的 `git push` 默认就是推到新仓库。

### 方案 B：重要节点同时推送两边

适用场景：

- 你想在过渡期里，让旧仓库和新仓库都保留一份最新代码

建议操作方式：

```bash
git push star main
git push origin main
```

注意：

- 这是**双推送**，不是自动同步
- 两个仓库都会收到提交
- 如果只推一边，另一边不会自动更新

### 方案 C：平时只推 `star`，阶段性再补推 `origin`

适用场景：

- 想把新仓库作为主仓
- 旧仓库只做阶段性备份或保留历史入口

建议操作方式：

日常：

```bash
git push
```

阶段性补推：

```bash
git push origin main
```

这是目前最符合你现状的做法。

---

## 6. Tag 与发布相关操作

如果后续发布版本，建议明确推送目标，避免 Tag 只到了一边。

### 6.1 推送 Tag 到新仓库

```bash
git push star --tags
```

### 6.2 推送 Tag 到旧仓库

```bash
git push origin --tags
```

### 6.3 推荐做法

如果后续正式发布完全转向 `Star Sanctuary`，建议：

- 正式 Release Tag 主要推送到 `star`
- 是否同步到 `origin`，按你的过渡策略决定

例如：

```bash
git push star main
git push star --tags
```

---

## 7. 如何确认自己不会推错仓库

在执行关键推送前，建议做这三步检查：

### 7.1 看当前分支跟踪谁

```bash
git branch -vv
```

如果看到：

```text
main [star/main]
```

就说明当前默认上游是 `star/main`。

### 7.2 显式写远程名

如果是关键操作，直接用：

```bash
git push star main
```

而不是只写 `git push`。

### 7.3 推送前看远程列表

```bash
git remote -v
```

确认：

- `origin` 还是旧仓库
- `star` 是新仓库

---

## 8. 什么时候可以考虑不再保留 `origin`

当以下条件都满足时，可以再评估是否移除旧远程：

- 新仓库 `star` 已成为唯一主开发仓库
- 旧仓库不再需要继续同步代码
- README、发布文档、镜像名、Release 流程都已切到新品牌
- 你确认不再需要对旧仓库做持续推送

如果以后决定移除旧远程，可执行：

```bash
git remote remove origin
```

**当前阶段不建议这样做。**

---

## 9. 如果以后想让 `origin` 也切到新仓库

如果未来你决定彻底把 `origin` 改成新仓库地址，而不是保留双远程，可以用：

```bash
git remote set-url origin https://github.com/vrboyzero/star-sanctuary.git
```

但这会改变很多默认心智模型：

- 以后 `origin` 不再是旧仓库
- 某些旧脚本、旧习惯、旧说明会失效

因此，当前阶段仍建议：

- **保留 `origin` 指向旧仓库**
- **保留 `star` 指向新仓库**

---

## 10. 当前阶段的推荐结论

结合你现在的项目状态，推荐这样做：

- **默认主开发仓库**：`star`
- **默认日常推送**：`git push`
- **关键节点更稳妥的推送方式**：`git push star main`
- **旧仓库处理方式**：先保留，不删除，不强制同步
- **如果某个里程碑想双备份**：额外执行一次 `git push origin main`

一句话总结：

**以后把 `star` 当主仓来用，`origin` 当保留仓来留。**
