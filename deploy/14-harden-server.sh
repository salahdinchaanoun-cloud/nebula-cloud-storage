#!/usr/bin/env bash
# Server hardening for the Nebula host (Ubuntu). Run with: sudo bash deploy/harden-server.sh
# Each step asks before changing anything. Read it first, and keep an SSH session open while running.
set -u
confirm(){ read -r -p "$1 [y/N] " a; [[ "$a" =~ ^[Yy]$ ]]; }

echo "== 1) Listening services (what is exposed) =="
ss -tlnp || true

echo; echo "== 2) MySQL: bind to localhost only =="
CNF=/etc/mysql/mysql.conf.d/mysqld.cnf
if [ -f "$CNF" ] && confirm "Set bind-address = 127.0.0.1 in $CNF and restart MySQL?"; then
  sed -i 's/^\s*bind-address\s*=.*/bind-address = 127.0.0.1/' "$CNF"
  grep -q '^bind-address' "$CNF" || echo 'bind-address = 127.0.0.1' >> "$CNF"
  systemctl restart mysql && echo "MySQL restarted, listening on localhost."
fi

echo; echo "== 3) rpcbind: disable if NFS is not used =="
if confirm "Disable rpcbind (port 111)?"; then
  systemctl disable --now rpcbind rpcbind.socket 2>/dev/null && echo "rpcbind disabled."
fi

echo; echo "== 4) SSH: keys only, no root login =="
if confirm "Disable SSH password login and root login? (make sure your key works first!)"; then
  cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak
  sed -i -E 's/^#?\s*PasswordAuthentication.*/PasswordAuthentication no/; s/^#?\s*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
  sshd -t && systemctl restart ssh && echo "SSH hardened (backup: sshd_config.bak)."
fi

echo; echo "== 5) fail2ban against brute force =="
if confirm "Install and enable fail2ban?"; then
  apt-get install -y fail2ban && systemctl enable --now fail2ban && echo "fail2ban active."
fi

echo; echo "== 6) Firewall: allow only SSH, HTTP, HTTPS =="
echo "Other ports (25035..26735, 8080, 2022, 3306) will be blocked from the internet."
echo "Services on those ports must then be reached through Apache or bound to 127.0.0.1."
if confirm "Apply firewall rules now?"; then
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
  ufw status verbose
fi

echo; echo "== 7) Apache: hide version and server header =="
if confirm "Apply Apache hardening (ServerTokens Prod, no Server header)?"; then
  a2enmod headers >/dev/null
  cp "$(dirname "$0")/apache-hardening.conf" /etc/apache2/conf-available/nebula-hardening.conf
  a2enconf nebula-hardening >/dev/null
  apache2ctl configtest && systemctl reload apache2 && echo "Apache hardened."
fi

echo; echo "Done. Re-run: ss -tlnp   and   nmap -Pn -p- --open <your domain> from outside."
