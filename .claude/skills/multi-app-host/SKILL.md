---
name: multi-app-host
description: 一台云主机上并存多个服务系统的部署隔离规范——同一 IP+8080 入口，用二级地址前缀 /<项目名>/ 区分，代码/数据/用户/日志/端口全按项目名派生隔离，根目录 project.json 声明版本与项目名。当用户要求部署/上线本系统、改端口或资源上限、排查 502/404/WS 断连、在同一台服务器上新增另一个系统、或改动 deploy 脚本时使用。
---

# 单机多系统部署规范

本工程与其它系统共用一台云主机（`47.96.140.240`）。三条目标：**部署互不影响、数据互不干扰、同一 IP+端口靠二级地址区分**。
规范权威版在 `../platform/doc/单机多系统部署.md`；本文是随工程走的可执行版。

## 核心：一个 name 派生一切

根目录 `project.json` 的 `name` 是唯一真源，**所有隔离面由它派生，不允许各处另起名字**：

| 隔离面 | 取值 |
|---|---|
| 二级地址前缀 | `/<name>/` |
| systemd 单元 | `<name>.service` |
| 运行用户 | `svc-<name>`（系统用户，nologin） |
| 代码目录 | `/opt/<name>` |
| **数据目录** | `/var/lib/<name>`（与代码分离，部署脚本永不触碰） |
| 日志目录 | `/var/log/<name>/app.log` |
| env 文件 | `/etc/<name>/<name>.env`（0640，只存哈希/密钥） |
| 内部端口 | `service.port`，段 **8081–8099**，**只绑 127.0.0.1** |
| 库隔离名 | SQLite `/var/lib/<name>/<name>.db`；MySQL/PG database + 专属账号都叫 `<name>` |
| Nginx 片段 | `/etc/nginx/apps/<name>.conf` |

`name` 命名：小写字母开头，只含小写字母/数字/连字符，2–31 字符，**全机唯一**（`ls /etc/nginx/apps/` 即台账）。

## 三条红线

1. **端口不外露**——整机只有 8080 在阿里云安全组放行；应用绑 `127.0.0.1`。绝不为某个系统再开对外端口。
2. **数据目录不进包**——`pack.sh` 清单只含代码 + `project.json`；部署脚本对 `/var/lib/<name>` 只 `mkdir -p`。
3. **资源封顶**——每个 service 设 `MemoryMax`/`CPUQuota`/`TasksMax`，一个系统崩不能拖垮邻居。

隔离不靠自觉，靠内核：systemd 单元的 `ProtectSystem=strict` + `ReadWritePaths` 让本服务**物理上写不到**别的系统的目录。

## 前缀剥离机制（最常踩的坑）

```
外网 :8080 nginx ── location /<name>/ ── proxy_pass http://127.0.0.1:<port>/;  ← 尾斜杠剥前缀
                                                                    └─> 应用看到的是 /api/xxx
```

所以：
- **服务端路由按无前缀写**（`/api/xxx`）。代码里再加一层 `/<name>` 就 404。
- **客户端 base 必须带前缀**：`https://todoo.top/<name>`，且一律 `API_BASE + path` 拼接。
- **WebSocket 同理**：`base.replace(/^http/,'ws') + '/ws'` → `ws://.../<name>/ws`。

### 如果本系统占域名根（`gateway.root: true`）

域名根 `https://todoo.top/` 默认 404。`project.json` 里把 `gateway.root` 设成 `true`，
`register-app.sh` 会把**全机单例**片段 `/etc/nginx/root-app.conf` 改写成指向本系统，
于是根路径直接打开它。根是单例，已被别的系统占着会直接注册失败，不会静默抢过来。

占根之后有两个入口，且**交到代码手里的路径完全一样**（根入口没有前缀可剥）：

```
https://todoo.top/         ── root-app.conf   ──不剥───> 应用看到 /api/xxx
https://todoo.top/<name>/  ── apps/<name>.conf ──剥前缀─> 应用看到 /api/xxx
```

代价只有一条，但很容易踩：**前端所有地址必须写相对路径**（`api/works`、`assets/x.css`）。
写 `/api/works` 在二级前缀入口下会打到网关根上 404。建议在自检里加断言盯着这条。

## 本工程的部署动作

**发布不在本仓执行**——平台系统（同级目录 `../platform`）是所有子系统唯一的发布入口：

```bash
cd ../platform
bash bin/deploy.sh site                   # 例行发布（不停机，秒级）
bash bin/deploy.sh site --first-time      # 首次上线
bash bin/deploy.sh site --config-only     # 改了 project.json 之后（只 restart 不生效）
bash bin/deploy.sh site --dry-run         # 只打印，不动服务器
bash bin/apps.sh diff                      # 本地注册表 vs 线上探活
```

`deploy.sh` 自己会做：自检 → 打包（并校验没混进数据目录）→ 传输 → 部署 → 经网关验证。
**不要手工拼 scp+ssh**，那样会绕过这些检查。

本仓只保留项目专属件：`project.json`、`deploy/pack.sh`（打包清单）、
`deploy/server-setup.sh`（首次上线时在服务器上跑，写机密 + 调平台的 `register-app.sh`）。

## 代码侧必须满足

1. 读 `PORT` / `HOST` env 并绑 `HOST`（生产 127.0.0.1），不硬编码。
2. 提供 `GET /api/health` 返回 `{ok:true,name,version}`，与 `project.json` 的 `service.healthPath` 一致。
3. 数据只写 `config.DATA_DIR`（由 `<NAME>_DATA` env 给），代码里不写死路径。
4. 改表结构等幂：新表 `CREATE TABLE IF NOT EXISTS`；**给已有表加列用 `addColumnIfMissing`**（`src/store/db.js`），SQLite 没有 `ADD COLUMN IF NOT EXISTS`，重复 ALTER 会报错。

## 常见坑

| 现象 | 原因 |
|---|---|
| 502 Bad Gateway | 应用没起来或没绑 `127.0.0.1:<port>`，看 `systemctl status <name>` |
| 带了前缀还 404 | nginx 片段没生成/没 reload，或代码里多加了一层前缀 |
| 前端请求全 404 | 写了 `fetch('/api/x')` 绝对路径，打到网关根上了 |
| WS 不返 101 | 缺 `/etc/nginx/conf.d/00-upgrade-map.conf`，或 Upgrade 头没透传 |
| WS 约 60s 断 | 片段里 `proxy_read_timeout 3600s` 被删或改小 |
| 413 | `project.json` 的 `gateway.maxBodySize` 太小，改完重跑 `register-app.sh` |
| 起不来，日志报只读文件系统 | 写了 `ReadWritePaths` 白名单之外的目录 |
| 改了 project.json 不生效 | 只 restart 了，没重跑 `register-app.sh` |
| 占根后根路径仍 404 | 网关是老版（`location /` 没 include `root-app.conf`），跑 `--gateway-only` + `--tls-only` |
| 占根后 `/<name>/` 下资源 404 | 前端写了绝对路径，占根系统必须全用相对路径 |

## 下线本系统

```bash
systemctl disable --now <name>
rm -f /etc/nginx/apps/<name>.conf /etc/systemd/system/<name>.service
nginx -t && systemctl reload nginx && systemctl daemon-reload
# /var/lib/<name> 人工确认备份后再删，脚本绝不代劳
```
