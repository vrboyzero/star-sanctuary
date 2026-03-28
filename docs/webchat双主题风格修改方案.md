# WebChat 双主题色系重新设计方案

> 基于两张参考图（暗色主题 & 亮色主题），重新定义 `theme.css` 中的 CSS 变量色系与元素风格，**不改变布局**。
> 同时在 `styles.css` / `theme.css` 中添加轻量装饰性动画。

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
| 页面底色 | 纯黑 `#050508` | 极深翡翠 `#040d10` | 参考图的深绿调 |
| Primary | 青蓝 `#00f3ff` | 翠绿 `#00e6c8` | 更偏向翡翠色调 |
| Secondary | 金色 `#ffd700` | 薰紫 `#c4a0ff` | 参考图中的紫色元素 |
| 表面层 | 纯白透明 | 翠绿透明 | 营造翡翠夜幕感 |
| Bot 气泡 | 蓝绿渐变 | 深翠渐变 | 与整体色调一致 |

### 2.2 亮色主题核心改变

| 属性 | 现有值 | 新值 | 理由 |
|------|--------|------|------|
| 页面底色 | 冷灰白 `#f5f6fa` | 薄荷米白 `#f0f5ed` | 参考图的暖绿基调 |
| Primary | 青蓝 `#0099aa` | 青玉 `#5a9a7e` | 沉稳的古典翠色 |
| Secondary | 暗金 `#c49000` | 暖褐 `#8c7355` | 古典木质感 |
| 文字色 | 冷深蓝 `#162033` | 深棕黑 `#3a3228` | 水墨感文字 |
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
- **仅暗色主题激活**：亮色主题下该伪元素隐藏

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
  /* 比视口大，平移时边缘不露白 */
  top: -25%;
  left: -25%;
  width: 150%;
  height: 150%;
  pointer-events: none;
  z-index: 0;                          /* 在内容之下 */
  opacity: 0.55;
  will-change: transform;

  /* 多个大小不一的径向渐变圆点，模拟散落星点 */
  background:
    /* 较亮的翠绿点 */
    radial-gradient(1.5px 1.5px at 12% 18%, rgba(0, 230, 200, 0.72) 50%, transparent 100%),
    radial-gradient(1px   1px   at 28% 42%, rgba(0, 200, 180, 0.55) 50%, transparent 100%),
    radial-gradient(2px   2px   at 65% 15%, rgba(0, 230, 200, 0.65) 50%, transparent 100%),
    radial-gradient(1px   1px   at 80% 55%, rgba(0, 210, 190, 0.50) 50%, transparent 100%),
    radial-gradient(1.5px 1.5px at 45% 72%, rgba(0, 230, 200, 0.60) 50%, transparent 100%),
    radial-gradient(1px   1px   at 92% 38%, rgba(0, 200, 180, 0.48) 50%, transparent 100%),
    /* 薰紫点（点缀） */
    radial-gradient(1.5px 1.5px at 35% 28%, rgba(196, 160, 255, 0.50) 50%, transparent 100%),
    radial-gradient(1px   1px   at 72% 68%, rgba(196, 160, 255, 0.40) 50%, transparent 100%),
    radial-gradient(1.5px 1.5px at 18% 82%, rgba(180, 140, 240, 0.45) 50%, transparent 100%),
    /* 微弱的大光晕（增加层次） */
    radial-gradient(80px 80px at 20% 30%, rgba(0, 200, 180, 0.04) 0%, transparent 100%),
    radial-gradient(60px 60px at 75% 60%, rgba(196, 160, 255, 0.03) 0%, transparent 100%);

  background-size: 100% 100%;
  background-repeat: no-repeat;

  animation: dark-particle-drift 45s linear infinite alternate;
}

@keyframes dark-particle-drift {
  0%   { transform: translate(0, 0); }
  100% { transform: translate(6%, -8%); }          /* 缓慢漂移 */
}

/* 尊重系统减少动画偏好 */
@media (prefers-reduced-motion: reduce) {
  html[data-theme="dark"] body::after {
    animation: none;
  }
}

/* 亮色主题下隐藏粒子层 */
html[data-theme="light"] body::after {
  content: none;
}
```

### 4.4 视觉效果描述

- 页面背景深处有 **9 个大小不一的翠绿 / 薰紫色星点**
- 两个极淡大光晕增加空间层次
- 整个图层每 45 秒缓慢漂移 ~6-8% 视口距离，营造"微风中的萤火"感
- 低透明度（0.55）保证不干扰文字可读性

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

/* -- 水彩晕染底纹层：body::after -- */
html[data-theme="light"] body::after {
  content: "";
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
  opacity: 0.38;

  background:
    /* 右上角：淡翠晕染 */
    radial-gradient(ellipse 45% 40% at 85% 8%,
      rgba(107, 158, 138, 0.18) 0%, transparent 70%),
    /* 左下角：暖褐晕染 */
    radial-gradient(ellipse 35% 50% at 10% 88%,
      rgba(140, 115, 85, 0.12) 0%, transparent 70%),
    /* 中央微弱翠绿 */
    radial-gradient(ellipse 60% 60% at 50% 50%,
      rgba(107, 158, 138, 0.06) 0%, transparent 80%);
}

/* -- 花瓣角落装饰：.layout::before / ::after -- */
/* 左上角花瓣 */
html[data-theme="light"] .layout::before {
  content: "";
  position: fixed;
  top: 8px;
  left: 8px;
  width: 80px;
  height: 80px;
  pointer-events: none;
  z-index: 100;
  opacity: 0.32;

  /* 用径向渐变模拟三瓣花 */
  background:
    radial-gradient(ellipse 28px 14px at 30% 50%,
      rgba(107, 158, 138, 0.5) 0%, transparent 100%),
    radial-gradient(ellipse 14px 28px at 55% 30%,
      rgba(140, 115, 85, 0.4) 0%, transparent 100%),
    radial-gradient(ellipse 24px 12px at 50% 65%,
      rgba(107, 158, 138, 0.35) 0%, transparent 100%),
    /* 花心 */
    radial-gradient(circle 4px at 42% 48%,
      rgba(140, 115, 85, 0.6) 0%, transparent 100%);

  animation: blossom-breathe 8s ease-in-out infinite alternate;
}

/* 右下角花瓣 */
html[data-theme="light"] .layout::after {
  content: "";
  position: fixed;
  bottom: 8px;
  right: 8px;
  width: 72px;
  height: 72px;
  pointer-events: none;
  z-index: 100;
  opacity: 0.26;
  transform: rotate(135deg);

  background:
    radial-gradient(ellipse 24px 12px at 35% 50%,
      rgba(107, 158, 138, 0.45) 0%, transparent 100%),
    radial-gradient(ellipse 12px 24px at 55% 35%,
      rgba(140, 115, 85, 0.35) 0%, transparent 100%),
    radial-gradient(ellipse 20px 10px at 48% 62%,
      rgba(107, 158, 138, 0.30) 0%, transparent 100%),
    radial-gradient(circle 3px at 44% 48%,
      rgba(140, 115, 85, 0.55) 0%, transparent 100%);

  animation: blossom-breathe 10s ease-in-out infinite alternate-reverse;
}

@keyframes blossom-breathe {
  0%   { transform: scale(1);    opacity: 0.26; }
  100% { transform: scale(1.08); opacity: 0.36; }
}

/* 右下角花瓣需保持旋转 */
html[data-theme="light"] .layout::after {
  animation: blossom-breathe-rotated 10s ease-in-out infinite alternate-reverse;
}

@keyframes blossom-breathe-rotated {
  0%   { transform: rotate(135deg) scale(1);    opacity: 0.22; }
  100% { transform: rotate(135deg) scale(1.08); opacity: 0.32; }
}

/* 暗色主题下隐藏花瓣装饰 */
html[data-theme="dark"] .layout::before,
html[data-theme="dark"] .layout::after {
  content: none;
}

/* 尊重系统减少动画偏好 */
@media (prefers-reduced-motion: reduce) {
  html[data-theme="light"] .layout::before,
  html[data-theme="light"] .layout::after {
    animation: none;
  }
}
```

### 5.4 视觉效果描述

- **水彩底纹**：页面右上有极淡翠绿晕染，左下有暖褐晕染，为整个页面增添"宣纸"质感
- **角落花瓣**：左上角和右下角各一朵由径向渐变构成的抽象三瓣花
  - 颜色取自 Primary（青玉）和 Secondary（暖褐）
  - 低透明度（0.26~0.36），不喧宾夺主
  - 8~10 秒周期呼吸动画，scale 变化仅 8%，极为含蓄
- **传达感受**：春日宣纸上的淡彩花卉印记

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

---

## 七、文件修改清单

| 文件 | 修改类型 | 内容 |
|------|----------|------|
| `apps/web/public/theme.css` | **替换** 变量值 | 暗色 + 亮色两组 CSS 变量全量更新 |
| `apps/web/public/theme.css` | **追加** 样式 | 暗色粒子层 + 亮色花瓣装饰 + 水彩底纹 |

> **不修改** `styles.css` 的布局代码。所有装饰性动画统一放在 `theme.css` 中。

---

## 八、验证计划

### 手动验证

1. 在浏览器中打开 WebChat 页面，分别测试暗色/亮色主题
2. 检查所有 UI 元素的可读性和对比度：
   - 聊天气泡（用户/bot）文字清晰度
   - 侧边栏文件树的选中/hover 状态
   - 弹窗（Settings / Tool Settings）的可读性
   - 代码块在 bot 气泡内的对比度
3. 验证装饰动画：
   - 暗色主题：粒子层是否可见、是否缓慢飘动、是否干扰阅读
   - 亮色主题：角落花瓣是否可见、呼吸动画是否顺滑、水彩底纹是否太浓
4. 确认主题切换过渡动画流畅（220ms transition）
5. 性能检查：打开 DevTools Performance 面板，确认无 layout thrashing

### 回归验证

- 切换主题后各按钮、输入框、下拉菜单正常工作
- Canvas 画布模式的颜色是否协调
- Memory Viewer / Goals 面板的颜色是否与新色系一致
