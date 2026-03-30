# WebChat UI 页面自适应与间距调整实现方案

基于您的截图和需求分析，当前 WebChat 页面存在的“对话区域固定高度”以及“上下间距过紧”的问题，根源在于目前采用的是**全局滚动条（Body Scroll）+ 固定高度限制（max-height）+ 粘性定位（position: sticky）**的混合布局模式。当内容超过屏幕高度时，粘性元素的遮挡造成了视觉上的间隙消失。

为了实现真正的现代化响应式布局，让对话区能随浏览器窗口大小完美拉伸，同时保证各板块间距舒适清爽，我们计划将页面重构为**全屏柔性布局 (Full-height Flex SPA)**。

## Proposed Changes

### `apps/web/public/styles.css`

#### [MODIFY] styles.css
我们将通过以下四个模块的样式修正，彻底解决布局问题：

1. **整体布局 (Layout) 化为全屏容器**
   将 `.layout` 设置为视口高度限制并去除外部滚动，让内部元素通过 flex 权重自动分配空间；并将 `gap` 从 16px 提升至 20px 增加透气感。
   - `min-height: 100vh;` 修改为 `height: 100vh;`
   - 增加 `box-sizing: border-box;` 和 `overflow: hidden;`
   - `gap: 16px;` 修改为 `gap: 20px;`

2. **释放聊天区域 (Chat) 的高度限制**
   移除过去强加的 `60vh` 高度天花板，让其根据父级 `.main-area` 动态撑满伸展。
   - 移除 `min-height: 400px;` 与 `max-height: 60vh;`
   - 增加 `height: 100%;` 保证内部滚动条正常工作。

3. **解除侧边栏的高度硬编码计算**
   过去使用了 `calc(100vh - 280px)` 是针对 body 滚动的妥协方案。现在采用 flex 后可直接使用比例填充。
   - `.sidebar` 和 `.agent-list-panel` 移除 `max-height: calc(100vh - 280px);`
   - 增加 `height: 100%;` 保证底部对齐。

4. **移除粘性定位 (Sticky) 以恢复间距**
   解除顶部 `Header` 与底部 `Composer` 的粘性属性，防止它们在视口变小时与主内容区重叠“贴紧”。
   - `.header`: 移除 `position: sticky; top: 20px;`，设为 `position: relative; flex-shrink: 0;`
   - `.composer`: 移除 `position: sticky; bottom: 20px;`，设为 `position: relative; flex-shrink: 0;`
   - `.panel`: 增加 `flex-shrink: 0;` 确保在窗口挤压下不被压缩。

## User Review Required

> [!IMPORTANT]
> **关于全局滚动的变更：**
> 该方案会将整个 WebChat 改为真正的单页应用 (SPA) 弹性体验：浏览器级别的外层滚动条将消失，取而代之的是左侧文件树、中间对话框、右侧 Agent 列表各自局部的独立滚动。此变更将不仅修复上述间隙与拉伸大小的问题，而且极大提升用户的交互体验。
> 
> **请确认是否同意执行此方案对 `styles.css` 进行重构？同意后我将直接为您修改该文件代码。**
