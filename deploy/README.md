# deploy/ - 本工程的发布专属件

> **发布不在本仓执行。** 平台系统（同级目录 `../platform`）是所有子系统唯一的发布入口：
> ```bash
> cd ../platform && bash bin/deploy.sh site
> ```

本目录只放**项目专属知识**——发布流程本身在平台。

| 文件 | 作用 | 谁调用 |
|---|---|---|
| `pack.sh` | 打包清单（哪些文件是运行时的）。产出 `site-server.tar.gz`，**绝不含数据目录** | 平台 `bin/deploy.sh` 第 2 步 |
| `server-setup.sh` | 首次上线时在服务器上跑：确保网关 → 解包到 `/opt/site` → 写机密到 env → 调平台的 `register-app.sh` → 自检 | 平台 `bin/deploy.sh --first-time` |

## 发布命令

```bash
cd ../platform
bash bin/deploy.sh site                   # 例行发布（不停机，秒级）
bash bin/deploy.sh site --first-time      # 首次上线
bash bin/deploy.sh site --config-only     # 改了 project.json 之后（只 restart 不生效）
bash bin/deploy.sh site --dry-run         # 只打印，不动服务器
bash bin/apps.sh diff                      # 本地注册表 vs 线上探活
```

`deploy.sh` 会自己做：自检 → 打包（并校验没混进数据目录）→ 传输 → 部署 → 经网关验证。
**不要手工拼 scp+ssh**，那样会绕过这些检查。

完整流程见 `../platform/doc/发布指南.md`。

## 线上布局

| 项 | 路径 |
|---|---|
| 外部入口（正式） | `https://todoo.top/` —— **本站占着域名根路径**（`project.json` 的 `gateway.root=true`） |
| 外部入口（二级前缀） | `https://todoo.top/site/...` —— 同一套代码，调试用 |
| 明文兜底 | `http://47.96.140.240:8080/` 与 `.../site/` |
| 内部监听 | `127.0.0.1:8083`（不对外） |
| 代码 | `/opt/site`（可覆盖重部署） |
| **数据** | `/var/lib/site`（**部署脚本永不触碰**） |
| 日志 | `/var/log/site/app.log` |
| env | `/etc/site/site.env`（0640，只存哈希/密钥） |
| 运行用户 | `svc-site` |
| systemd | `site.service` |
| nginx 片段 | `/etc/nginx/apps/site.conf`（由 `register-app.sh` 生成，**勿手改**） |
| nginx 根片段 | `/etc/nginx/root-app.conf`（全机单例，`# owner: site`，同样由 `register-app.sh` 生成） |
| 图片 | `/var/lib/site/images/<id>`（数据目录内，部署永不触碰） |

## 改这两个脚本时注意

- **`pack.sh` 的清单**：加了新的顶层运行时文件/目录要补进 `ITEMS`。**数据目录永远不许进包**——平台 `deploy.sh` 打包后会扫 tar，混进去直接失败。
- **`server-setup.sh` 的机密逻辑**：见文件里的 TODO 段。只写哈希/随机密钥，**明文绝不落盘**；只改 env 里自己那一行，别整个覆盖（`register-app.sh` 会保留 `project.json` 的 `secrets` 里列出的键）。
  加了机密后记得把 `../platform/apps.json` 里本项的 `needsSecretArg` 改成 `true`、补 `secretPrompt`。

## 本站占根，多出来的两件事

1. **下线前要还原根片段**：直接 `rm /etc/nginx/apps/site.conf` 会让根路径 502，
   因为 `/etc/nginx/root-app.conf` 还指着一个已经没了的 upstream。
   正确顺序：先把平台仓的 `server/root-app.conf`（默认 404 版）铺回去，`nginx -t` 通过再 reload，
   然后才停服务、删应用片段。
2. **网关必须是 include 版**：`gateway.conf` / `gateway-ssl.conf` 的 `location /` 要写成
   `include /etc/nginx/root-app.conf;`。老版本是写死的 404，那样占根不生效。
   `register-app.sh` 会替你检查并报错，按提示跑 `bash bin/deploy.sh --gateway-only` 与 `--tls-only`。

## 运维

```bash
ssh -i <pem> root@47.96.140.240 'systemctl status site --no-pager'
ssh -i <pem> root@47.96.140.240 'tail -f /var/log/site/app.log'
ssh -i <pem> root@47.96.140.240 'tail -f /var/log/nginx/gateway-error.log'   # 502 看这里
ssh -i <pem> root@47.96.140.240 'ls /etc/nginx/apps/'                        # 全机端口台账
scp -i <pem> -r root@47.96.140.240:/var/lib/site ./backup                   # 备份数据
```

## 下线

```bash
ssh -i <pem> root@47.96.140.240 '
  systemctl disable --now site
  rm -f /etc/nginx/apps/site.conf /etc/systemd/system/site.service
  nginx -t && systemctl reload nginx && systemctl daemon-reload
'
# /var/lib/site 人工确认备份后再删
# 最后把 ../platform/apps.json 里本项的 status 改成 retired
```
