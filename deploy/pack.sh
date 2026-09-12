#!/usr/bin/env bash
#
# pack.sh - 把运行时文件打成部署包。在工程根目录运行：bash deploy/pack.sh
#
# 产物：deploy/site-server.tar.gz
#   解包后是 server.js / project.json / package.json / src/ / public/（保持目录结构），
#   与 server-setup.sh 的 `tar -xzf -C /opt/site` 对齐。
#   public/ 是站点的静态页面与资源，由 src/http/routes/static.js 出——必须进包。
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

# 打包清单：加了新的顶层运行时文件/目录记得补进来
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
tar -tzf "$OUT" | head -30
