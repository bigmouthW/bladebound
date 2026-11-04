[English](README.md) | **简体中文**

# 飞刃行者 Bladebound

浏览器单键飞刃闯关原型。三关、十二段手工关卡，包含切割积能、蓄能破盾、断箭、高位分路、检查点、六种关间强化与外观解锁。

## 独立交付

版本：0.2.0。项目标识：bladebound-prototype。独立工程文件夹：bladebound。

本目录是飞刃行者的完整交付副本，开发、构建与部署时均以本目录为工程根目录。压缩包解压后保留 bladebound 顶层文件夹，与其他游戏分开存放。

| 目录或文件 | 内容 |
| --- | --- |
| src、index.html | 全部游戏源码与入口，包含英语和中文 |
| public/assets | 游戏原创素材 |
| tests | 单元测试、浏览器验收与连续流程脚本 |
| docs | 游戏设计文档、原型运行与验收记录 |
| dist | 构建产物，`npm run build` 生成；默认不入库，可直接交给 HTTP 静态服务器部署 |
| package.json、package-lock.json | 依赖及锁定版本 |
| deploy | Nginx 配置模板、部署说明与公网检查脚本 |
| THIRD_PARTY_NOTICES.md | 第三方许可 |

压缩包不包含可重新安装的 node_modules、临时日志或其他游戏工程；生产版 dist 已包含运行依赖。运行源码需要 Node.js 22 或兼容版本，并执行下方 npm ci 安装依赖。直接双击 index.html 不支持模块加载，应通过 HTTP 服务运行。

## 在线试玩

默认使用英语。开始界面可选择 English 或中文，游戏中可在 Settings / 设置的 Language / 语言选项切换；选择会在当前浏览器保存。

服务器部署与后续更新见 [部署说明](deploy/README.zh-CN.md)。

## 运行

```powershell
npm ci
npm run dev -- --port 4176
```

在本目录执行命令。本地地址为 http://127.0.0.1:4176。服务器不会自动打开浏览器；如果端口已占用，请换用另一个空闲端口。

```powershell
npm run build
npm test
```

生产文件输出到 dist。浏览器后台测试：

```powershell
npx playwright install chromium --only-shell
$env:BLADEBOUND_URL='http://127.0.0.1:4176'
npm run test:browser
npm run test:playthrough
npm run test:i18n
```

也可通过 BLADEBOUND_BROWSER 指定已经安装的 Chromium 系浏览器可执行文件；测试始终使用 headless 模式。

连续流程脚本使用轻松难度和固定时钟，通过输入事件完成三关；不传送或修改战斗收益。它不能代替真人手感与平衡测试。

## 设计资料

- [完整游戏设计文档](docs/bladebound/game-design.zh-CN.md)
- [原型运行与验收](docs/bladebound/acceptance.zh-CN.md)

## 操作

点击画面、点击翻跃按钮或按空格翻跃。P 或 Escape 暂停。关间选择一项强化后继续。设置、外观、金币与纪录保存在当前浏览器。

本项目使用原创 SVG 素材、Matter.js 和 Lucide。第三方许可见 THIRD_PARTY_NOTICES.md。当前没有广告、支付、账号或数据上报。
