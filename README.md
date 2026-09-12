# site · 紫夜堂（todoo.top）

个人站点：展示做过的游戏作品、介绍自己写的 App、发布产品资讯，外加一个改这些内容的管理后台。
站名「紫夜堂」存在设置表里（`site_title`），后台可改，不写死在代码中。

**访客只读**——没有评论、留言、投稿、注册，也没有对应的接口。这是产品决定，理由写在
[doc/需求文档.md](doc/需求文档.md) 第 6 节，不是还没做。

线上：<https://todoo.top/>　｜　ICP 备案：闽ICP备2026032416号-1

## 技术栈

Node ≥ 22.5，**零外部依赖**——只用内置模块（`node:sqlite` 需要 `--experimental-sqlite`），
`npm install` 什么都不装。前端是不经构建的原生 HTML/CSS/JS。

```
server.js         入口：只装配与监听
src/http/         路由分发 + 一个领域一个文件（static.js 兜底出静态文件）
src/store/        数据层，SQL 只写在这一层
public/           公开站点页面与资源（进部署包）
console/          管理后台页面（**不进部署包**，线上没有这个目录）
selftest.js       零依赖端到端自检（100 项），同时是回归网与活文档
selftest-pages.js 页面冒烟：headless 浏览器真开一遍，看渲染出的是内容还是报错
```

界面是深色的「紫夜」配色，首屏一个顶满屏宽的站名巨字。
视觉约定与几个别踩的坑写在 [CLAUDE.md](CLAUDE.md) 的「前端设计约定」。

## 本地跑起来

```bash
npm run seed            # 塞示例内容（只动本地 data/，已有内容不覆盖）
npm start               # http://127.0.0.1:8083/ ，后台在 /admin.html（本地默认密码 admin）
npm run selftest        # 改完代码必跑
npm run selftest:pages  # 改完前端必跑（没装 Edge/Chrome 会自动跳过）
```

**管理后台只在本地开得出来**——`console/` 不进部署包，线上 `/admin.html` 是 404，
扫描器扫不到登录框。要管线上内容，在登录页把「管理目标」切到云端地址，
请求跨域直打线上 `/api/admin/*`（接口仍在线上，去掉的是页面）。
注意本地实例和线上是**两套密码**：本地库没设过就回落到 `admin`，
在本地实例里输线上密码当然是错的。

## 部署

**不在本仓执行。** 与它同机的其它系统一样，发布统一走平台仓（同级目录 `../platform`）：

```bash
cd ../platform && bash bin/deploy.sh site
```

本站是那台机器上的**站点根应用**（`project.json` 的 `gateway.root: true`），
也就是说 `https://todoo.top/` 直接打开它，同时 `https://todoo.top/site/` 也通。
两个入口交到代码手里的路径完全一样——代价是前端地址**必须写相对路径**，
自检里有断言盯着这条。机制见 [CLAUDE.md](CLAUDE.md) 与 `../platform/doc/单机多系统部署.md`。

## 文档

| 文档 | 内容 |
|---|---|
| [CLAUDE.md](CLAUDE.md) | 最关键的事实、分层纪律、改代码前必读 |
| [doc/需求文档.md](doc/需求文档.md) | 做什么、**明确不做什么**、内容模型 |
| [doc/架构文档.md](doc/架构文档.md) | 它在整台机器里的位置、几个设计决定与理由 |
| [doc/接口文档.md](doc/接口文档.md) | 前台只读接口 + 管理后台接口 |
| [doc/开发文档.md](doc/开发文档.md) | 环境、加一个领域的步骤、常见坑 |
