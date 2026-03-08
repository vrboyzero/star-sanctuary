# Star Sanctuary Browser Relay Extension

此 Chrome 扩展用于将真实的浏览器连接到 Star Sanctuary Agent。

## 安装步骤

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`。
2. 开启右上角的 **"开发者模式" (Developer mode)**。
3. 点击 **"加载已解压的扩展程序" (Load unpacked)**。
4. 选择本目录：`E:\project\Belldandy\Belldandy\apps\browser-extension` (请根据实际路径选择)。

## 使用方法

1. 确保 Star Sanctuary Relay Server 已启动：
   ```bash
   node packages/belldandy-browser/dist/bin/relay.js
   ```
2. 在 Chrome 中点击扩展图标 **Star Sanctuary Relay**。
   - 扩展会自动尝试连接到 `ws://127.0.0.1:28892/extension`。
   - 连接成功后，Relay Server 终端会显示 `[Relay] Extension 已连接`。

## 功能

- 充当 Agent (Puppeteer) 与 Chrome Tab 之间的桥梁。
- 复用浏览器的登录态（Cookie/Session）。

