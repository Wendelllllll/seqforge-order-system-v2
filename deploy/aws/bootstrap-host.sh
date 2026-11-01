#!/usr/bin/env bash
# Approved initial setup for the NEW seqforge-test-web Lightsail instance only.
# Does not configure a database, start the app, send email, or open extra ports.
set -euo pipefail

test "$(id -u)" = 0
. /etc/os-release
test "$ID" = ubuntu
test "$VERSION_ID" = 24.04
test "$(dpkg --print-architecture)" = amd64
ip -4 -o address show | grep -Fq '172.26.2.121/'

for package in docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker containerd runc; do
    if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -Fq 'install ok installed'; then
        echo "Unexpected conflicting package; review before proceeding: $package" >&2
        exit 1
    fi
done

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl unzip
install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod 0644 /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<'EOF'
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: amd64
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get install -y --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

# A dedicated new 2 GiB swap file provides build headroom on this 4 GiB host.
# Never overwrite an existing file or any device.
if ! swapon --noheadings --show=NAME | grep -q .; then
    if test -e /swapfile; then
        echo '/swapfile already exists but is not active; review it before proceeding.' >&2
        exit 1
    fi
    install -m 0600 /dev/null /swapfile
    fallocate -l 2G /swapfile
    mkswap /swapfile
    swapon /swapfile
    if ! grep -Fqx '/swapfile none swap sw 0 0' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
fi

install -d -m 0755 /opt/seqforge/releases /etc/seqforge
install -d -m 0700 /var/backups/seqforge
install -d -o 1000 -g 1000 -m 0700 /srv/seqforge/seqforgebio/results
docker version --format '{{.Server.Version}}'
docker compose version
systemctl is-enabled docker
free -h
