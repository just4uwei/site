#!/usr/bin/env bash
#
# pack.sh - 把运行时文件打成部署包。在工程根目录运行：bash deploy/pack.sh
#
# 产物：deploy/site-server.tar.gz
#   解包后是 server.js / project.json / package.json / src/ / public/（保持目录结构），
#   与 server-setup.sh 的 `tar -xzf -C /opt/site` 对齐。
#   public/ 是公开站点的静态页面与资源，由 src/http/routes/static.js 出——必须进包。
#   console/ 是管理台页面，**故意不进包**：线上不留登录框。
#
# 红线：**绝不含数据目录**。线上数据在 /var/lib/site，与代码目录分离，
#       所以重新部署代码永远不会碰到线上数据。
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
# 相对路径 require：Git Bash 的 /c/... 风格路径 node 解析不了，必须先 cd 再用 ./
NAME="$(node -e "process.stdout.write(require('./project.json').name)")"
OUT="$ROOT_DIR/deploy/$NAME-server.tar.gz"

# 打包清单：加了新的顶层运行时文件/目录记得补进来。
# **console/ 有意不在清单里**：管理台页面只在本地起，线上不留登录框（扫描器扫不到）。
# 去掉的只是页面，/api/admin/* 接口仍然上线——否则本地管理台无从连接线上内容。
ITEMS="server.js project.json package.json src public hash-admin.js"

echo "Packing $NAME server -> $OUT"

missing=0
for f in $ITEMS; do
    if [[ ! -e "$f" ]]; then
        echo "  缺少: $ROOT_DIR/$f" >&2
        missing=1
    fi
done
[[ "$missing" -ne 0 ]] && exit 1

tar -czf "$OUT" $ITEMS
echo "Done. Contents:"
# 用 awk 而不是 `| head -30`：head 取够就关掉管道，tar 吃到 SIGPIPE，
# 而本脚本开了 pipefail —— 于是包内文件一超过 30 个，整个 pack.sh 就以 141 退出，
# 发布在打包这步直接断掉。awk 会读完全部输入，不会提前关管道。
tar -tzf "$OUT" | awk 'NR<=30 {print} END {if (NR>30) print "  ...... 共 " NR " 项"}'
