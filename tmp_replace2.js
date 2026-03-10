import fs from 'fs';
let c = fs.readFileSync('e:/project/belldandy/apps/web/public/app.js', 'utf8');

const old1 = '2. 回到你刚才双击 <code>start.bat</code>（或执行启动命令）的<b>黑色终端窗口</b>。';
const new1 = '2. <b>保持刚才启动服务的黑色窗口不要关</b>，然后在项目目录下重新打开一个<b>新的黑色终端窗口</b>（如 PowerShell 或 CMD）。';
c = c.split(old1).join(new1);

const old2 = '3. 在那个窗口里，复制并粘贴下面的完整命令，然后按回车键：';
const new2 = '3. 在这边重新打开的新窗口里，复制并粘贴下面的完整命令，然后按回车键：';
c = c.split(old2).join(new2);

fs.writeFileSync('e:/project/belldandy/apps/web/public/app.js', c);
console.log('Replacement done.');
