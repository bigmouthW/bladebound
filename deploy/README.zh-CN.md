[English](README.md) | **简体中文**

# 部署说明

本目录只存放静态托管的配置模板与验证脚本，**不包含任何服务器地址、账号或凭据**。真实地址在部署时通过环境变量传入。

| 文件 | 用途 |
| --- | --- |
| bladebound-3392.conf | Nginx 站点配置模板，监听 3392 端口，托管构建好的 dist |
| verify-public.mjs | 公网验收脚本，用桌面与模拟移动端各跑一遍并生成报告 |

## 前置条件

服务器只需 Nginx 与静态文件，不需要 Node.js，也不需要运行 Vite。构建在本地完成，只上传 `dist` 的内容。

首次部署时按实际环境修改模板中的 `listen` 端口与 `root` 站点根目录，再放到 Nginx 的配置目录：

```bash
sudo cp bladebound-3392.conf /etc/nginx/conf.d/
sudo nginx -t
sudo systemctl reload nginx
```

## 更新步骤

本地构建并打包，版本名建议带上日期：

```powershell
npm run build
tar -czf artifacts/bladebound-release-<version>.tar.gz -C dist .
scp artifacts/bladebound-release-<version>.tar.gz <user>@<your-server-ip>:/tmp/
```

在服务器上每次发布使用新的 releases 目录，保留旧版本以便回退：

```bash
set -eu
release=/opt/bladebound/releases/<version>
previous=$(readlink -f /opt/bladebound/current)
test ! -e "$release"
install -d -m 755 "$release"
tar -xzf /tmp/bladebound-release-<version>.tar.gz -C "$release" --no-same-owner
cp -an "$previous/assets/." "$release/assets/"
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
test -f "$release/index.html"
nginx -t
ln -s "$release" /opt/bladebound/current.next
mv -Tf /opt/bladebound/current.next /opt/bladebound/current
systemctl reload nginx
curl --fail --silent --output /dev/null http://127.0.0.1:3392/
```

保留旧版 assets 可以避免切换瞬间仍在用旧入口的浏览器请求旧哈希文件而出现 404；新版本已有的文件不会被覆盖。`current` 应始终是软链接，不要建成实际目录。

## 状态与回退

```bash
systemctl status nginx --no-pager
readlink -f /opt/bladebound/current
tail -n 30 /var/log/nginx/bladebound-error.log
```

回退时把 `current.next` 指向要恢复的 releases 目录，再执行 `mv -Tf` 替换 `current` 并 reload Nginx。

## 验证

入口页不缓存，带内容哈希的 JS 与 CSS 长期缓存，所以发布后手机刷新入口即可拿到新构建。公网验收：

```powershell
$env:BLADEBOUND_URL='http://<your-server-ip>:3392'
$env:BLADEBOUND_BROWSER='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
node deploy/verify-public.mjs
```

不设置 `BLADEBOUND_URL` 时默认检查 `http://127.0.0.1:3392`，适合在服务器本机或本地静态服务上跑。报告与截图输出到 `test-results/`。

浏览器验收使用 headless 模式，移动端结果来自 Chromium 手机模拟，不能代替物理手机或 Safari 实机检查。
