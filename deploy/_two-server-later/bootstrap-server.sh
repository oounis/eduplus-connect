#!/usr/bin/env bash
# EduPlus Connect — VPS bootstrap.
#
# Takes a freshly delivered Ubuntu 24.04 box from "root with a password" to
# "hardened host running Docker, reachable only where it should be".
#
#   APP server:  sudo ./bootstrap-server.sh app  10.10.10.1
#   DB  server:  sudo ./bootstrap-server.sh db   10.10.10.2
#
# Idempotent: safe to re-run.
#
# It deliberately does NOT open the database to the internet, and it locks SSH
# down to keys. Read it before you run it — a bootstrap script that you have
# not read is just someone else's opinion about your firewall.

set -euo pipefail

ROLE="${1:-}"
WG_ADDR="${2:-}"
WG_PORT="${WG_PORT:-51820}"
ADMIN_USER="${ADMIN_USER:-eduplus}"

if [ "$ROLE" != "app" ] && [ "$ROLE" != "db" ]; then
  echo "usage: $0 <app|db> <wireguard-address>" >&2
  exit 1
fi
if [ -z "$WG_ADDR" ]; then
  echo "usage: $0 $ROLE <wireguard-address>   e.g. 10.10.10.1" >&2
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "run as root" >&2
  exit 1
fi

echo "==> Bootstrapping $ROLE server (WireGuard $WG_ADDR)"

# --- 1. Patch --------------------------------------------------------------
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  ca-certificates curl gnupg ufw fail2ban wireguard unattended-upgrades \
  chrony postgresql-client-16 rclone jq

# Security updates apply themselves. An unpatched box is the likeliest way
# this gets compromised, and nobody remembers to log in and run apt.
dpkg-reconfigure -f noninteractive unattended-upgrades

# The whole period feature depends on the clock being right.
systemctl enable --now chrony

# --- 2. Admin user ---------------------------------------------------------
if ! id "$ADMIN_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$ADMIN_USER"
  usermod -aG sudo "$ADMIN_USER"
  mkdir -p "/home/$ADMIN_USER/.ssh"
  # Carry over whatever key was used to reach root, so this does not lock
  # everyone out before a key has been installed.
  if [ -f /root/.ssh/authorized_keys ]; then
    cp /root/.ssh/authorized_keys "/home/$ADMIN_USER/.ssh/authorized_keys"
  fi
  chown -R "$ADMIN_USER:$ADMIN_USER" "/home/$ADMIN_USER/.ssh"
  chmod 700 "/home/$ADMIN_USER/.ssh"
  chmod 600 "/home/$ADMIN_USER/.ssh/authorized_keys" 2>/dev/null || true
  echo "==> created admin user: $ADMIN_USER"
fi

# --- 3. SSH ----------------------------------------------------------------
# Refuse to disable passwords if no key is installed — that would lock the box.
if [ -s "/home/$ADMIN_USER/.ssh/authorized_keys" ]; then
  cat > /etc/ssh/sshd_config.d/99-eduplus.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
X11Forwarding no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
  systemctl reload ssh || systemctl reload sshd
  echo "==> SSH: keys only, root login disabled"
else
  echo "!!  No SSH key found for $ADMIN_USER."
  echo "!!  Password login LEFT ENABLED so you are not locked out."
  echo "!!  Install a key, then re-run this script."
fi

# --- 4. Firewall -----------------------------------------------------------
# Default deny. Each role opens only what it needs.
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'ssh'
ufw allow "$WG_PORT"/udp comment 'wireguard'

if [ "$ROLE" = "app" ]; then
  ufw allow 80/tcp  comment 'http (acme + redirect)'
  ufw allow 443/tcp comment 'https'
else
  # The database is NOT open to the internet. Postgres and pgBouncer are
  # reachable over the WireGuard interface only; the compose file binds them
  # to the private address, and this is the second lock on the same door.
  ufw allow in on wg0 to any port 5432 proto tcp comment 'postgres (wg only)'
  ufw allow in on wg0 to any port 6432 proto tcp comment 'pgbouncer (wg only)'
fi

ufw --force enable
echo "==> firewall active"

# fail2ban watches SSH; nginx rate limiting handles the app.
systemctl enable --now fail2ban

# --- 5. Docker -------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
fi
usermod -aG docker "$ADMIN_USER"

# Cap the logs. Docker's default json-file driver has no rotation, and a
# chatty container will fill the disk and take Postgres down with it.
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "live-restore": true
}
EOF
systemctl enable --now docker
systemctl restart docker
echo "==> docker ready"

# --- 6. Kernel tuning ------------------------------------------------------
# Defaults are sized for a desktop. These are the ones that bite a server
# holding thousands of concurrent connections.
cat > /etc/sysctl.d/99-eduplus.conf <<'EOF'
# Bigger accept queue: the default 4096 is where bursts are dropped silently.
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.core.netdev_max_backlog = 65535

# Reclaim TIME_WAIT sockets. A proxy makes a lot of short-lived connections.
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
net.ipv4.ip_local_port_range = 10240 65535

net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 5

# Databases and page cache: prefer cache over swapping.
vm.swappiness = 10
vm.overcommit_memory = 1

fs.file-max = 2097152
EOF
sysctl -p /etc/sysctl.d/99-eduplus.conf >/dev/null

cat > /etc/security/limits.d/99-eduplus.conf <<'EOF'
*  soft  nofile  1048576
*  hard  nofile  1048576
EOF

mkdir -p /opt/eduplus
chown -R "$ADMIN_USER:$ADMIN_USER" /opt/eduplus

echo
echo "==> $ROLE server ready."
echo "    Next: configure WireGuard ($WG_ADDR), then deploy from /opt/eduplus."
echo "    See deploy/README.md."
