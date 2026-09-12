# CLAUDE.md

本文件是本仓库的项目说明，每次会话自动加载。详细内容见 `doc/`，本文件只做索引与最关键的事实。

## 项目简介
「官网」（内部标识 `site`）—— todoo.top 的对外站点：展示个人游戏作品、介绍自己做的 App、
发布产品资讯，外加一个改这些内容的管理后台。

**访客只读**：站点没有评论、留言、投稿、点赞这类用户产出内容的功能，也没有对应的接口。
这是产品决定，不是还没做——详见 [doc/需求文档.md](doc/需求文档.md) 第 6 节。

本工程由 `../platform/template` 脚手架生成，遵循**单机多系统**发布规范：
与其它系统共用一台云主机与同一个 nginx 网关，代码/数据/用户/日志/端口全隔离。

## 最关键的事实
- **本站是「站点根应用」**：`project.json` 的 `gateway.root = true`，占着域名根路径。
  两个入口同时有效，交到代码手里的路径完全一样：

  | 入口 | 地址 | 网关怎么做的 |
  |---|---|---|
  | 根（正式） | `https://todoo.top/` | `/etc/nginx/root-app.conf` 反代，**无前缀可剥** |
  | 二级前缀（调试） | `https://todoo.top/site/` | `/etc/nginx/apps/site.conf`，`proxy_pass` 尾斜杠剥掉 `/site/` |

  明文兜底 `http://47.96.140.240:8080/`（同样两条路都通）。
- 因为有两个入口，**前端所有地址必须写相对路径**（`api/works`、`assets/site.css`），
  写成 `/api/works` 在二级前缀入口下会打到网关根上 404。这条有自检兜着，见 `selftest.js`。
- 应用只绑 `127.0.0.1:8083`，不对外；整机对外放行 443（HTTPS 正式）/ 80（ACME+跳转）/ 8080（明文兜底）
- 线上：代码 `/opt/site`、数据 `/var/lib/site`、日志 `/var/log/site/app.log`、env `/etc/site/site.env`
- **`project.json` 的 `name` 是唯一真源**，派生二级地址名/服务名/用户名/目录名/库名。
- ICP 备案号存在 `settings` 表的 `icp` 键里，默认 `闽ICP备2026032416号-1`，页脚必显示。
  这是工信部的法定展示要求，别把页脚那段删了。

## 目录结构
```
project.json    工程配置：软件版本 + 项目名 name + gateway.root（占根）
server.js       入口：只做装配与监听（本站无 WebSocket，纯只读展示用不上）
src/
  config.js     env + project.json，配置唯一真源
  http/
    router.js   路由分发（路径按无前缀写；static.js 的 prefix 是空串，必须排最后）
    respond.js  CORS/JSON/二进制 响应工具
    auth.js     管理后台鉴权（内存态 atoken）
    routes/
      health.js  健康检查（规范要求，勿删）
      public.js  前台只读接口，GET 之外一律 405
      images.js  出图 /api/image?id=（长缓存 + ETag）
      admin.js   管理后台 /api/admin/*
      static.js  public/ 静态页兜底
  store/
    db.js       连接 + 建表（等幂）+ addColumnIfMissing
    index.js    数据层门面
    content.js  works/apps/news 三个**同构**模块 + 截图（一套 SQL 通吃）
    settings.js 站点设置 key/value（DEFAULTS 就是键白名单）
    images.js   图片元数据进库、字节落盘 /var/lib/site/images/<id>
public/         站点静态文件：8 个前台页 + admin.html + assets/
seed.js         往**本地**库塞示例内容，方便看效果（不进部署包）
selftest.js     零依赖端到端自检，同时是回归网与活文档
deploy/         pack.sh（打包）/ server-setup.sh（一键部署）/ README.md
doc/            需求/架构/接口/开发 文档
```

## 关键命令
```bash
npm start            # 本地起服务（8083），浏览 http://127.0.0.1:8083/
npm run dev          # 同上，带 --watch
npm run seed         # 塞示例内容（只动本地 data/，已有内容就不覆盖）
npm run selftest     # 自检，改业务后必跑；它是重构时的保命网
bash deploy/pack.sh  # 打包（产出 deploy/site-server.tar.gz，绝不含数据目录）
```

发布走平台，不在本仓做：`cd ../platform && bash bin/deploy.sh site`。

## 分层纪律（改代码前必读）
- 路由层只做参数校验 + 调 store + 响应；**业务与 SQL 写在 `src/store/`**，不要往路由里堆。
- `works` / `apps` / `news` 三张表**故意同构**。要给其中一个加字段，三张一起加，
  别让它们分叉——分叉了 `content.js` 那套通用 SQL 就废了，管理后台也得拆成三套。
- 路径**按无前缀写**（`/api/xxx`）。
- **前端一律相对路径**，禁止 `/api/x`、`/assets/x` 这种绝对路径（见上面「最关键的事实」）。
- 前台是只读的：`public.js` 里 GET 之外一律 405，且**不要新增任何写入型前台接口**。
  要加，先回头看需求文档为什么排除了它。
- 正文渲染走 `paragraphs()`，纯文本转义后分段，**不解析 HTML**——后台内容也不给注入的机会。
- 数据只写 `config.DATA_DIR`（生产 `/var/lib/site`），路径不要硬编码。
- 改表结构必须等幂：新表用 `CREATE TABLE IF NOT EXISTS`，**给已有表加列必须用 `addColumnIfMissing`**。
- `server.js` 只装配不写业务；它超过 100 行说明有东西该下沉到 `src/`。

## 前端设计约定
整站是一张**方格稿纸**：桌面 → 稿纸（方格印在它上面）→ 压在纸上的白块，三层。
正文一律落在白块里，格线不穿过字。无圆角、无阴影，只有 1px 墨线。
字体全走系统栈——**Google Fonts 在大陆取不到，不许把站点挂在它上面**；
拉丁字面排在中文字面前面，否则 Windows 上 SimSun 会把拉丁字也画了，又细又假。
色与字的 token 全在 `public/assets/site.css` 顶部，改配色只改那里。

## 部署（详见 [deploy/README.md](deploy/README.md)）
- 发布：在平台仓 `bash bin/deploy.sh site`
- **改了 `project.json`**：`bash bin/deploy.sh site --config-only`，否则端口/资源上限/占根都不生效
- 本站占根，所以 `server-setup.sh` 除了验 `/site/api/health`，还会验根路径 `/` 是否 200

## 安全约束（必守）
- 管理密码只存 scrypt 哈希到 `/etc/site/site.env`，**明文绝不落盘、绝不入库、绝不写进文档或记忆**
- 图片上传按 Content-Type 过白名单（png/jpeg/webp/gif/svg），单张 8M 封顶——站点不是文件托管
- `*.pem` 私钥勿泄露、勿入库
- 打包清单绝不含数据目录；部署脚本绝不删改 `/var/lib/site`

## Skill
- [multi-app-host](.claude/skills/multi-app-host/SKILL.md) - 单机多系统部署隔离规范（统一入口 + 二级地址前缀 + 站点根应用、`project.json` 的 name 派生一切）。部署、改端口、上线新系统、改 deploy 脚本时使用。
