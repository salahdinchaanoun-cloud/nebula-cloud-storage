# Security changes

## Application (index.js)
- Session cookie is `Secure` by default. Set `COOKIE_SECURE=false` only for local HTTP testing.
- `Permissions-Policy` header disables camera, microphone, geolocation, payment, USB and FLoC.
- The app listens on `127.0.0.1` by default. Apache proxies public traffic. Set `HOST=0.0.0.0` only if you deliberately expose Node directly.
- Warning at startup if `SESSION_SECRET` is not set.

## Server (deploy/)
- `apache-hardening.conf`: hides Apache version and the Server header.
- `harden-server.sh`: interactive. Restricts MySQL to localhost, disables rpcbind, hardens SSH, installs fail2ban, and sets the firewall to allow only 22, 80 and 443. It asks before each step.

## Known remaining item
- `Content-Security-Policy` still allows `'unsafe-inline'` scripts and `https:` script sources. Inline scripts in the templates and the admin-configured ad network need it. Tightening requires nonces for every inline script first.

## SEO / فهرسة (v78)
- أُضيفت المسارات: /robots.txt و /sitemap.xml و /llms.txt (تسمح لمحركات البحث وبوتات الذكاء الاصطناعي بالصفحات العامة فقط).
- الصفحات الخاصة (لوحة التحكم، الملفات، الروابط، API…) ترسل X-Robots-Tag: noindex.
- head.ejs: canonical وrobots وOpenGraph/Twitter وJSON-LD.
- تأكد من ضبط PUBLIC_URL على نطاقك الحقيقي.
