# WebChat 双主题色系重新设计方案

> 基于两张参考图（暗色主题 & 亮色主题），重新定义 `theme.css` 中的 CSS 变量色系与元素风格，**不改变布局**。
> 同时在 `styles.css` / `theme.css` 中添加轻量装饰性动画。

---

## 当前进度（2026-03-29）

- `已完成`：`apps/web/public/theme.css` 的暗色主题变量已进一步调整为“更暗、更偏蓝”的夜幕风格
- `已完成`：`apps/web/public/theme.css` 的亮色主题变量已整体压低亮度，纸面感更重、不再过亮
- `已完成`：亮色主题兼容别名已补齐，避免旧样式继续引用暗色块中的兼容变量
- `已完成`：暗色粒子层、亮色水彩底纹、亮色角落花瓣装饰已按第二轮反馈增强可见度
- `已完成`：亮色主题 bot 气泡内 Markdown 代码块对比度已改为更贴合新主题的墨绿深色覆盖层
- `已完成`：构建级 smoke 验证通过，执行命令为 `corepack pnpm build`
- `待验收`：仍需用户在浏览器中确认第二轮色调与装饰增强后的主观观感是否达到预期

### 实际落地说明

- 本次实现仅修改 `apps/web/public/theme.css`，**未改动** `apps/web/public/styles.css` 的布局结构
- 相比原方案，实际实现为保证装饰层可见且不压住交互内容，给 `body` 与 `.layout` 增加了 `position: relative` 和 `isolation: isolate`
- 经过第二轮修正后，暗色粒子层与亮色水彩层实际使用 `z-index: 0` 挂在可见背景层，正文内容通过 `.layout` 与 `.layout > *` 提升层级保持清晰
- 亮色花瓣装饰实际挂在 `.layout::before / ::after`，并改为 `position: fixed` 以稳定贴在视口角落
- 页面背景实际从单层径向渐变调整为“双径向渐变 + 纯色底”的叠加，以便更自然地承接新主题色板
- 文档中的颜色目标已基本落地，但最终是否“足够满意”仍以浏览器视觉验收为准

---

## 一、参考图分析

### 1.1 暗色主题（暗.png）— "Elegance in Darkness"

**整体氛围**：神秘、奇幻、深邃的夜间魔法森林感

- **主背景**：极深的翡翠色/墨绿色 (`#040d0f` → `#0a1a1c`) 而非纯黑
- **主强调色（Primary）**：青绿色/翠光 (`#00e6c8` ~ `#40ffd9`)，带有柔和的发光效果
- **次强调色（Secondary）**：薰衣草紫/淡紫 (`#c4a0ff` ~ `#9b7ed4`)，用于装饰性元素
- **表面层**：半透明的深翠绿 (`rgba(0, 40, 45, 0.6)`)，带玻璃磨砂效果
- **边框**：翠绿色微光 (`rgba(0, 200, 180, 0.12)`)
- **文字**：主文字接近白色/淡银 (`#e8f0ee`)，次要文字为雾绿 (`rgba(200, 230, 220, 0.6)`)
- **Bot 气泡**：深翠渐变 (`#003d3a` → `#004850`)，边框带翠光微辉
- **装饰特征**：星点粒子光效、微弱的荧光扫描线、翠光辉光（glow）

### 1.2 亮色主题（明.png）— "Spring Blossom Art"

**整体氛围**：素雅、清新、中式水墨春景感

- **主背景**：极淡的薄荷绿/米白 (`#f0f5ed` → `#e8efe5`)
- **主强调色（Primary）**：青玉色/淡翠 (`#6b9e8a` ~ `#4d8872`) — 沉稳的古典翠色
- **次强调色（Secondary）**：暖褐/浅棕 (`#8c7355` ~ `#a68b6b`) — 木质、古典饰品感
- **表面层**：半透明暖白 (`rgba(255, 253, 248, 0.82)`)，带纸质纹理感
- **边框**：淡翠线条 (`rgba(107, 158, 138, 0.18)`)，纤细、古典
- **文字**：主文字深棕黑 (`#3a3228`)，次要文字柔和棕 (`rgba(58, 50, 40, 0.6)`)
- **Bot 气泡**：淡翠渐变 (`#5a9a7e` → `#4a8a6e`)，保持白色文字
- **装饰特征**：花瓣边框装饰（CSS 实现）、淡雅水彩晕染背景、云纹分隔线

---

## 二、设计决策

> **核心原则**：仅修改 `theme.css` 中的 CSS 变量值和少量元素级样式，不改动 `styles.css` 的布局结构。所有变化都通过颜色变量、渐变、阴影、背景等视觉属性实现。

### 2.1 暗色主题核心改变

| 属性 | 现有值 | 新值 | 理由 |
|------|--------|------|------|
| 页面底色 | 纯黑 `#050508` | 深蓝夜幕 `#030711` | 按第二轮反馈压暗并减少偏绿感 |
| Primary | 青蓝 `#00f3ff` | 冰蓝 `#39c9ff` | 保留冷光感，同时让整体更偏蓝 |
| Secondary | 金色 `#ffd700` | 薰紫 `#c4a0ff` | 参考图中的紫色元素 |
| 表面层 | 纯白透明 | 深蓝透明 | 与新的蓝黑夜幕统一 |
| Bot 气泡 | 蓝绿渐变 | 深蓝渐变 | 避免主聊天区继续显绿 |

### 2.2 亮色主题核心改变

| 属性 | 现有值 | 新值 | 理由 |
|------|--------|------|------|
| 页面底色 | 冷灰白 `#f5f6fa` | 压暗纸绿 `#dfe6db` | 按第二轮反馈降低整体亮度 |
| Primary | 青蓝 `#0099aa` | 青玉 `#5a9a7e` | 沉稳的古典翠色 |
| Secondary | 暗金 `#c49000` | 暖褐 `#8c7355` | 古典木质感 |
| 文字色 | 冷深蓝 `#162033` | 更深棕黑 `#322b23` | 亮面压暗后同步增强文字落纸感 |
| Bot 气泡 | 蓝绿渐变 | 淡翠渐变 | 春绿古典风格 |

---

## 三、修改范围

### 3.1 theme.css — CSS 变量替换

完整替换暗色和亮色两组 CSS 变量定义块，涵盖：

- 所有 `--color-*` 基础变量
- 所有 `--chat-*` 聊天气泡变量
- 所有 `--canvas-*` 画布变量
- 所有 `--memory-*` / `--goal-*` 功能面板变量
- 所有 `--notice-*` / `--badge-*` 通知与徽章变量
- `body` 背景相关渐变变量

> 不会改变任何 CSS 选择器或类名，仅修改变量值。

### 3.2 theme.css — 轻量装饰性动画（新增）

在 `theme.css` 末尾追加暗色/亮色主题各自的装饰性样式规则，详见下方第四、五章。

---

## 四、暗色主题 — 轻量荧光粒子方案

### 4.1 设计思路

使用 **纯 CSS** 实现飘浮粒子感，不引入 Canvas/JS/额外 DOM 节点。
利用 `body::after` 伪元素叠加一层**多个径向渐变点**，再通过一个 `@keyframes` 缓慢平移整个图层，
产生"星点在夜幕中飘动"的视觉效果。

### 4.2 性能保证

- **零 JS、零额外 DOM**：仅一个 `::after` 伪元素
- **动画属性为 `transform`**：浏览器可走 GPU 合成层，不触发 layout/paint
- **`will-change: transform`** + `pointer-events: none`：提示浏览器优化，不影响交互
- **`prefers-reduced-motion`**：尊重系统无障碍设置，自动禁用动画
- **暗亮主题分层复用**：暗色主题使用粒子层，亮色主题的 `body::after` 复用于水彩底纹层

### 4.3 CSS 实现

```css
/* ===================================================================
   暗色主题：荧光粒子飘浮层（body::after）
   用多个径向渐变圆点模拟星点粒子，通过缓慢 transform 平移产生飘动感
   =================================================================== */

/* -- 暗色主题下的粒子层 -- */
html[data-theme="dark"] body::after {
  content: "";
  position: fixed;
  top: -25%;
  left: -25%;
  width: 150%;
  height: 150%;
  pointer-events: none;
  z-index: 0;
  opacity: 0.6;
  will-change: transform;
  background:
    radial-gradient(6px 6px at 12% 18%, rgba(64, 210, 255, 0.84) 44%, transparent 100%),
    radial-gradient(4px 4px at 28% 42%, rgba(84, 178, 255, 0.68) 44%, transparent 100%),
    radial-gradient(7px 7px at 65% 15%, rgba(64, 210, 255, 0.78) 44%, transparent 100%),
    radial-gradient(4px 4px at 80% 55%, rgba(92, 194, 255, 0.62) 44%, transparent 100%),
    radial-gradient(6px 6px at 45% 72%, rgba(64, 210, 255, 0.74) 44%, transparent 100%),
    radial-gradient(4px 4px at 92% 38%, rgba(84, 178, 255, 0.58) 44%, transparent 100%),
    radial-gradient(5px 5px at 22% 58%, rgba(92, 194, 255, 0.66) 44%, transparent 100%),
    radial-gradient(7px 7px at 58% 34%, rgba(64, 210, 255, 0.76) 44%, transparent 100%),
    radial-gradient(5px 5px at 76% 24%, rgba(84, 178, 255, 0.64) 44%, transparent 100%),
    radial-gradient(6px 6px at 86% 76%, rgba(64, 210, 255, 0.72) 44%, transparent 100%),
    radial-gradient(5px 5px at 35% 28%, rgba(196, 160, 255, 0.62) 44%, transparent 100%),
    radial-gradient(4px 4px at 72% 68%, rgba(196, 160, 255, 0.52) 44%, transparent 100%),
    radial-gradient(5px 5px at 18% 82%, rgba(180, 140, 240, 0.58) 44%, transparent 100%),
    radial-gradient(7px 7px at 54% 12%, rgba(196, 160, 255, 0.64) 44%, transparent 100%),
    radial-gradient(4px 4px at 67% 82%, rgba(180, 140, 240, 0.5) 44%, transparent 100%),
    radial-gradient(6px 6px at 9% 66%, rgba(196, 160, 255, 0.56) 44%, transparent 100%),
    radial-gradient(5px 5px at 41% 88%, rgba(180, 140, 240, 0.52) 44%, transparent 100%),
    radial-gradient(7px 7px at 88% 14%, rgba(196, 160, 255, 0.6) 44%, transparent 100%),
    radial-gradient(60px 60px at 20% 30%, rgba(84, 178, 255, 0.08) 0%, transparent 100%),
    radial-gradient(96px 96px at 75% 60%, rgba(196, 160, 255, 0.06) 0%, transparent 100%);
  background-repeat: no-repeat;
  animation: dark-particle-drift 45s linear infinite alternate;
}

@keyframes dark-particle-drift {
  0% {
    transform: translate(0, 0);
  }

  100% {
    transform: translate(6%, -8%);
  }
}

@media (prefers-reduced-motion: reduce) {
  html[data-theme="dark"] body::after {
    animation: none;
  }
}
```

### 4.4 视觉效果描述

- 页面背景深处有 **18 个大小不一的冰蓝 / 薰紫色星点**
- 星点尺寸已较原方案放大，当前为更容易感知的 `4px-7px` 级别
- 两个光晕增加空间层次，其中左上光晕已按第二轮反馈缩小 50%
- 整个图层每 45 秒缓慢漂移 ~6-8% 视口距离，营造"微风中的萤火"感
- 当前粒子层透明度约为 `0.60`，以保证“看得见但仍不压住正文”

---

## 五、亮色主题 — 轻量花瓣角落装饰方案

### 5.1 设计思路

使用 CSS **伪元素 + 径向渐变** 在主内容区的**四角**绘制抽象花瓣装饰
（而非所有卡片，避免视觉过载）。目标区域：`.layout` 容器的 `::before` / `::after`。

同时在 `body::after` 上叠加一层极淡水彩晕染渐变，增加"宣纸/水墨"底纹感。

### 5.2 性能保证

- **纯 CSS 伪元素**，零 JS、零图片请求
- 使用 `transform` 做微弱的呼吸动画（仅 scale），走 GPU 合成
- 亮色主题独有代码仅在 `html[data-theme="light"]` 下生效
- `prefers-reduced-motion` 兼容

### 5.3 CSS 实现

```css
/* ===================================================================
   亮色主题：花瓣角落装饰 + 水彩底纹
   =================================================================== */

html[data-theme="light"] body::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.62;
  background:
    radial-gradient(ellipse 48% 42% at 85% 8%, rgba(107, 158, 138, 0.34) 0%, transparent 72%),
    radial-gradient(ellipse 38% 52% at 10% 88%, rgba(140, 115, 85, 0.24) 0%, transparent 72%),
    radial-gradient(ellipse 62% 62% at 50% 50%, rgba(107, 158, 138, 0.14) 0%, transparent 84%),
    radial-gradient(ellipse 42% 36% at 24% 12%, rgba(196, 210, 187, 0.18) 0%, transparent 74%);
}

.layout {
  position: relative;
  isolation: isolate;
  z-index: 1;
}

.layout > * {
  position: relative;
  z-index: 1;
}

html[data-theme="light"] .layout::before,
html[data-theme="light"] .layout::after {
  content: "";
  position: fixed;
  pointer-events: none;
  z-index: 0;
}

html[data-theme="light"] .layout::before {
  position: fixed;
  top: 14px;
  left: 14px;
  width: 148px;
  height: 148px;
  opacity: 0.5;
  background:
    radial-gradient(ellipse 48px 24px at 30% 50%, rgba(107, 158, 138, 0.68) 0%, transparent 100%),
    radial-gradient(ellipse 22px 48px at 55% 30%, rgba(140, 115, 85, 0.54) 0%, transparent 100%),
    radial-gradient(ellipse 40px 18px at 50% 65%, rgba(107, 158, 138, 0.48) 0%, transparent 100%),
    radial-gradient(circle 7px at 42% 48%, rgba(140, 115, 85, 0.72) 0%, transparent 100%);
  animation: blossom-breathe 8s ease-in-out infinite alternate;
}

html[data-theme="light"] .layout::after {
  right: 14px;
  bottom: 14px;
  width: 132px;
  height: 132px;
  opacity: 0.46;
  background:
    radial-gradient(ellipse 42px 20px at 35% 50%, rgba(107, 158, 138, 0.62) 0%, transparent 100%),
    radial-gradient(ellipse 20px 42px at 55% 35%, rgba(140, 115, 85, 0.46) 0%, transparent 100%),
    radial-gradient(ellipse 34px 16px at 48% 62%, rgba(107, 158, 138, 0.42) 0%, transparent 100%),
    radial-gradient(circle 6px at 44% 48%, rgba(140, 115, 85, 0.66) 0%, transparent 100%);
  animation: blossom-breathe-rotated 10s ease-in-out infinite alternate-reverse;
}

@keyframes blossom-breathe {
  0% {
    transform: scale(1);
    opacity: 0.42;
  }

  100% {
    transform: scale(1.08);
    opacity: 0.58;
  }
}

@keyframes blossom-breathe-rotated {
  0% {
    transform: rotate(135deg) scale(1);
    opacity: 0.38;
  }

  100% {
    transform: rotate(135deg) scale(1.08);
    opacity: 0.54;
  }
}

@media (prefers-reduced-motion: reduce) {
  html[data-theme="light"] .layout::before,
  html[data-theme="light"] .layout::after {
    animation: none;
  }
}
```

### 5.4 视觉效果描述

- **水彩底纹**：页面右上有更明显的翠绿晕染，左下有更明显的暖褐晕染，中央与左上还补了一层更淡的纸面染色，整体宣纸感更明确
- **角落花瓣**：左上角和右下角各一朵由径向渐变构成的抽象三瓣花
  - 颜色取自 Primary（青玉）和 Secondary（暖褐）
  - 第二轮中已明显放大尺寸，并提升透明度区间与花瓣面积
  - 8~10 秒周期呼吸动画，scale 变化仅 8%，极为含蓄
- **传达感受**：从“几乎察觉不到的淡印”调整为“能被明确感知的宣纸淡彩花卉印记”

---

## 六、伪元素冲突检查

需要确认现有 `body::before` 和 `body::after`、`.layout::before` 和 `.layout::after` 是否已被其他样式占用：

| 伪元素 | 当前用途 | 新用途 | 冲突? |
|--------|----------|--------|-------|
| `body::before` | 背景 mesh 渐变（已有，在 `styles.css` line 40-53） | 保持不变 | ✅ 无冲突 |
| `body::after` | **未使用** | 暗色→粒子层 / 亮色→水彩底纹 | ✅ 可用 |
| `.layout::before` | **未使用** | 亮色→左上角花瓣 | ✅ 可用 |
| `.layout::after` | **未使用** | 亮色→右下角花瓣 | ✅ 可用 |

> 已确认：`body::before` 在 `styles.css` 中用于背景 mesh，不会冲突。
> `body::after`、`.layout::before`、`.layout::after` 在整个项目中无其他使用，可以安全使用。

### 6.1 实际实现备注

- 实际代码中，`body::after` 与 `.layout::before / ::after` 已落地到 `apps/web/public/theme.css`
- 为避免装饰层覆盖正文、同时修复“效果几乎不可见”的问题，实际使用的是分层背景方案：
  - `body::before` 与 `body::after` 位于可见背景层
  - `.layout` 与 `.layout > *` 提升层级，保证正文与交互控件始终在装饰层之上
  - `.layout::before / ::after` 使用 `position: fixed` 贴在视口角落
  - `body` 与 `.layout` 增加了 `isolation: isolate`
- 第二轮实现中，暗色主题的主色板已从“偏绿的翡翠夜幕”收敛为“更暗、更偏蓝的夜幕”
- 第二轮实现中，亮色主题的主背景、面板和卡片整体压暗，避免页面过亮发白
- 这属于实现细节优化，不改变原方案的视觉目标

---

## 七、文件修改清单

| 文件 | 修改类型 | 内容 |
|------|----------|------|
| `apps/web/public/theme.css` | **替换** 变量值 | 暗色 + 亮色两组 CSS 变量全量更新 |
| `apps/web/public/theme.css` | **追加** 样式 | 暗色粒子层 + 亮色花瓣装饰 + 水彩底纹 |
| `apps/web/public/theme.css` | **补充** 兼容变量 | 为亮色主题补齐 `--primary` / `--secondary` / `--glass-*` / `--text-*` 等兼容别名 |
| `apps/web/public/theme.css` | **微调** 局部样式 | 亮色主题 bot 气泡内代码块覆盖色从偏蓝改为偏墨绿，以匹配新主题语气 |
| `apps/web/public/theme.css` | **第二轮微调** 色调 | 暗色主题改为更暗偏蓝，亮色主题整体压暗 |
| `apps/web/public/theme.css` | **第二轮微调** 装饰 | 星点增至 18 个并放大，左上光晕缩小，水彩底纹与角落花瓣显著增强 |
| `docs/webchat双主题风格修改方案.md` | **更新** 进度说明 | 补充当前完成进度、实现备注、验证状态 |

> **不修改** `styles.css` 的布局代码。所有装饰性动画统一放在 `theme.css` 中。

---

## 八、验证计划

### 已完成验证

- `构建验证`：执行 `corepack pnpm build` 成功通过
- `静态检查`：已确认 `styles.css` 中只有 `body::before` 被占用，不与本次新增伪元素冲突
- `静态检查`：已确认旧主色值与旧亮主题代码块覆盖色已从 `theme.css` 中移除
- `静态检查`：已确认第二轮中暗主题主聊天气泡与主背景已切换到蓝系，避免页面整体偏绿
- `静态检查`：已确认暗色粒子层目前为 18 个更大尺寸星点，亮色底纹与花瓣透明度区间已上调

### 待人工验收

### 手动验证

1. 在浏览器中打开 WebChat 页面，分别测试暗色/亮色主题
2. 检查所有 UI 元素的可读性和对比度：
   - 聊天气泡（用户/bot）文字清晰度
   - 侧边栏文件树的选中/hover 状态
   - 弹窗（Settings / Tool Settings）的可读性
   - 代码块在 bot 气泡内的对比度
3. 验证装饰动画：
   - 暗色主题：18 个更大星点是否足够明显、左上光晕是否已缩小、整体是否仍不干扰阅读
   - 亮色主题：水彩底纹是否已经明确可见、角落花瓣是否终于可被感知、呼吸动画是否顺滑
4. 确认主题切换过渡动画流畅（220ms transition）
5. 性能检查：打开 DevTools Performance 面板，确认无 layout thrashing

### 回归验证

- 切换主题后各按钮、输入框、下拉菜单正常工作
- Canvas 画布模式的颜色是否协调
- Memory Viewer / Goals 面板的颜色是否与新色系一致
- 亮色主题下 bot 气泡内代码块、引用块、行内代码是否与新气泡底色协调
- 暗色主题是否仍然存在“整体偏绿”的主观观感
- 亮色主题是否仍然存在“整体过亮”的主观观感
