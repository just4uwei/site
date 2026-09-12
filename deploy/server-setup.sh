#!/usr/bin/env bash
#
# server-setup.sh - 本系统的一键部署（幂等）。遵循单机多系统规范。
#
# 用法（服务器上，root）：
#   sudo bash server-setup.sh
#
# 做的事：
#   1. 装 Node 22（已装跳过）
#   2. 确保 nginx 网关就绪（缺则跑 platform 的 gateway-setup.sh）
#   3. 解包代码到 /opt/site（不碰 /var/lib/site）
#   4. 写机密到 /etc/site/site.env（本模板没有机密，见下方 TODO）
#   5. 调 platform 的 register-app.sh，按 project.json 注册并启动
#   6. 经网关自检 /site/api/health
#
# 前置：本脚本需与 site-server.tar.gz、register-app.sh、gateway/ 放在同一目录
#       （从 ../platform 传过来）。
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

APP_NAME="site"
INSTALL_DIR="/opt/$APP_NAME"
ETC_DIR="/etc/$APP_NAME"
ENV_FILE="$ETC_DIR/$APP_NAME.env"
DATA_DIR="/var/lib/$APP_NAME"
TARBALL="$SCRIPT_DIR/$APP_NAME-server.tar.gz"

if [[ "$(id -u)" != "0" ]]; then
    echo "请用 root 运行：sudo bash server-setup.sh" >&2
    exit 1
fi

find_file() {
    for d in "$SCRIPT_DIR" "$SCRIPT_DIR/gateway" "$SCRIPT_DIR/.."; do
        [[ -f "$d/$1" ]] && { echo "$d/$1"; return 0; }
    done
    echo "找不到 $1（需要从平台仓 ../platform 一起传上来）" >&2
    return 1
}

echo "==> [1/6] 安装 Node 22 (NodeSource)"
node_ver_ok() {
    command -v node >/dev/null 2>&1 || return 1
    local v; v="$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
    [[ "$v" =~ ^[0-9]+$ ]] && [[ "$v" -ge 22 ]]
}
if node_ver_ok; then
    echo "    Node $(node -v) 已安装，跳过"
else
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi

echo "==> [2/6] 确保网关就绪（nginx:8080 统一入口）"
if [[ -d /etc/nginx/apps ]] && [[ -f /etc/nginx/conf.d/gateway.conf ]]; then
    echo "    网关已就绪，跳过"
else
    bash "$(find_file gateway-setup.sh)"
fi

echo "==> [3/6] 解包 $TARBALL -> $INSTALL_DIR（只覆盖代码，不碰 $DATA_DIR）"
if [[ ! -f "$TARBALL" ]]; then
    echo "    错误：找不到 $TARBALL；先在本地跑 bash deploy/pack.sh" >&2
    exit 1
fi
mkdir -p "$INSTALL_DIR"
tar -xzf "$TARBALL" -C "$INSTALL_DIR"
if [[ ! -f "$INSTALL_DIR/project.json" ]]; then
    echo "    错误：包里没有 project.json" >&2
    exit 1
fi

echo "==> [4/6] 写机密到 $ENV_FILE"
mkdir -p "$ETC_DIR"
touch "$ENV_FILE"; chmod 600 "$ENV_FILE"
# 管理台密码：scrypt 哈希写入 env，明文绝不落盘。
# 首次部署时由调用方传入密码（$1），后续重新部署不传则保留已有哈希不动。
if [[ -n "${1:-}" ]]; then
    HASH="$(node "$INSTALL_DIR/hash-admin.js" "$1")"
    grep -v '^ADMIN_PASSWORD_HASH=' "$ENV_FILE" > "$ENV_FILE.new" || true
    echo "ADMIN_PASSWORD_HASH=$HASH" >> "$ENV_FILE.new"
    mv -f "$ENV_FILE.new" "$ENV_FILE"; chmod 600 "$ENV_FILE"
    echo "    已写入管理台密码哈希"
elif ! grep -q '^ADMIN_PASSWORD_HASH=' "$ENV_FILE"; then
    echo "    警告：未传入密码且 env 中无已有哈希，管理台将使用默认密码（仅 dev）" >&2
else
    echo "    保留已有管理台密码哈希"
fi

echo "==> [5/6] 按 project.json 注册应用"
bash "$(find_file register-app.sh)" "$INSTALL_DIR/project.json"

echo "==> [6/6] 经网关自检"
sleep 1
code="$(curl -fsS -o /dev/null -w "%{http_code}" "http://127.0.0.1:8080/$APP_NAME/api/health" 2>/dev/null || true)"
if [[ "$code" == "200" ]]; then
    echo "    OK: /$APP_NAME/api/health -> 200（网关 -> 应用 全链路通）"
else
    echo "    警告：/$APP_NAME/api/health 未返回 200（got '${code:-空}'）" >&2
    echo "    排查: journalctl -u $APP_NAME -e  或  tail -f /var/log/$APP_NAME/app.log  或  nginx -t" >&2
    systemctl status "$APP_NAME" --no-pager || true
    exit 1
fi

# 本站还占着域名根路径（project.json 的 gateway.root=true，由 register-app.sh
# 写 /etc/nginx/root-app.conf 生效）。根路径打不开首页就等于站点没上线，必须一起验。
rootcode="$(curl -fsS -o /dev/null -w "%{http_code}" "http://127.0.0.1:8080/" 2>/dev/null || true)"
if [[ "$rootcode" == "200" ]]; then
    echo "    OK: 根路径 / -> 200（域名根直接打开首页）"
else
    echo "    警告：根路径 / 未返回 200（got '${rootcode:-空}'）" >&2
    echo "    查：grep -n owner /etc/nginx/root-app.conf 应是 '# owner: $APP_NAME'；" >&2
    echo "        grep -n root-app /etc/nginx/conf.d/gateway.conf 应有 include。" >&2
    echo "        网关是旧版就在平台仓跑 bash bin/deploy.sh --gateway-only 与 --tls-only。" >&2
    exit 1
fi

cat <<EOF

==> 部署完成。
    正式入口: https://todoo.top/            （根路径，本站占根）
    二级入口: https://todoo.top/$APP_NAME/  （调试用，同一套代码）
    管理后台: https://todoo.top/admin.html
    外网验证: curl http://47.96.140.240:8080/$APP_NAME/api/health
    代码:     $INSTALL_DIR   （可随意重新部署覆盖）
    数据:     $DATA_DIR      （部署脚本永不触碰）
    日志:     tail -f /var/log/$APP_NAME/app.log
    重启:     sudo systemctl restart $APP_NAME
EOF
