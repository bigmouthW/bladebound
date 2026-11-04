**English** | [简体中文](README.zh-CN.md)

# Deployment notes

This directory holds only a static-hosting config template and a verification script. It contains **no server address, account, or credential** of any kind; the real address is supplied at deploy time through an environment variable.

| File | Purpose |
| --- | --- |
| `bladebound-3392.conf` | Nginx site template, listening on port 3392, serving the built `dist` |
| `verify-public.mjs` | Public deployment check, runs desktop and simulated mobile passes and writes a report |

## Prerequisites

The server needs only Nginx and static files — no Node.js, no Vite at runtime. Build locally and upload nothing but the contents of `dist`.

For a first deployment, adjust the `listen` port and `root` document root in the template to match your environment, then drop it into Nginx's config directory:

```bash
sudo cp bladebound-3392.conf /etc/nginx/conf.d/
sudo nginx -t
sudo systemctl reload nginx
```

## Updating

Build and package locally. Version names should carry a date:

```powershell
npm run build
tar -czf artifacts/bladebound-release-<version>.tar.gz -C dist .
scp artifacts/bladebound-release-<version>.tar.gz <user>@<your-server-ip>:/tmp/
```

On the server, give every release its own directory under `releases` and keep the old ones for rollback:

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

Carrying the previous `assets` forward prevents a 404 for browsers still holding the old entry page when the switch happens; files that already exist in the new build are left untouched. `current` must always be a symlink — never a real directory.

## Status and rollback

```bash
systemctl status nginx --no-pager
readlink -f /opt/bladebound/current
tail -n 30 /var/log/nginx/bladebound-error.log
```

To roll back, point `current.next` at the release you want to restore, replace `current` with `mv -Tf`, then reload Nginx.

## Verification

The entry page is not cached while hashed JS and CSS are cached long-term, so refreshing the entry page on a phone is enough to pick up a new build. Public check:

```powershell
$env:BLADEBOUND_URL='http://<your-server-ip>:3392'
$env:BLADEBOUND_BROWSER='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
node deploy/verify-public.mjs
```

With no `BLADEBOUND_URL` set it defaults to `http://127.0.0.1:3392`, which suits a run on the server itself or against a local static server. Reports and screenshots land in `test-results/`.

Browser checks run headless, and mobile results come from Chromium device emulation — no substitute for a physical phone or Safari on real hardware.
