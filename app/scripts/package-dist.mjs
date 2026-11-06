#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(APP_ROOT, '..');
const DIST_PKG_DIR = path.resolve(PROJECT_ROOT, 'call-analysis-dist');
const DIST_DIR = path.resolve(DIST_PKG_DIR, 'dist');

console.log('=== Packaging Call Analysis OS V2 for Deployment ===');
console.log(`Source App: ${APP_ROOT}`);
console.log(`Target Package: ${DIST_PKG_DIR}`);

// 1. Check standalone build
const standaloneDir = path.join(APP_ROOT, '.next', 'standalone');
if (!fs.existsSync(path.join(standaloneDir, 'server.js'))) {
  console.error('ERROR: .next/standalone/server.js not found. Please run `npm run build` first.');
  process.exit(1);
}

// 2. Prepare clean directory
if (fs.existsSync(DIST_PKG_DIR)) {
  fs.rmSync(DIST_PKG_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });

// 3. Copy standalone files to dist/
console.log('Copying standalone bundle...');
fs.cpSync(standaloneDir, DIST_DIR, { recursive: true });

// 4. Copy static assets to dist/.next/static
console.log('Copying static assets...');
const staticSrc = path.join(APP_ROOT, '.next', 'static');
const staticDest = path.join(DIST_DIR, '.next', 'static');
fs.mkdirSync(staticDest, { recursive: true });
fs.cpSync(staticSrc, staticDest, { recursive: true });

// 5. Copy public folder
console.log('Copying public assets...');
const publicSrc = path.join(APP_ROOT, 'public');
const publicDest = path.join(DIST_DIR, 'public');
fs.cpSync(publicSrc, publicDest, { recursive: true });

// 6. Copy db folder with schemas and dump
console.log('Copying database schemas & SQL dumps...');
const dbDest = path.join(DIST_DIR, 'db');
fs.mkdirSync(dbDest, { recursive: true });
fs.cpSync(path.join(APP_ROOT, 'db'), dbDest, { recursive: true });

// Also copy full_dump.sql to schema_with_data.sql for clarity
if (fs.existsSync(path.join(dbDest, 'full_dump.sql'))) {
  fs.copyFileSync(path.join(dbDest, 'full_dump.sql'), path.join(dbDest, 'schema_with_data.sql'));
}

// 7. Copy scripts/db.mjs
console.log('Copying migration script...');
const scriptsDest = path.join(DIST_DIR, 'scripts');
fs.mkdirSync(scriptsDest, { recursive: true });
fs.copyFileSync(path.join(APP_ROOT, 'scripts', 'db.mjs'), path.join(scriptsDest, 'db.mjs'));

// 8. Copy multi-platform native argon2 modules if available
const sonicModulesPath = 'D:\\Pucho claude project\\oct2026\\Pucho_sonic_group\\sonic-os-dist\\dist\\node_modules\\@node-rs';
const targetNodeRs = path.join(DIST_DIR, 'node_modules', '@node-rs');
if (fs.existsSync(sonicModulesPath) && fs.existsSync(targetNodeRs)) {
  console.log('Adding multi-arch native binaries (Alpine/Debian/ARM64/Windows)...');
  const items = fs.readdirSync(sonicModulesPath);
  for (const item of items) {
    const srcItem = path.join(sonicModulesPath, item);
    const destItem = path.join(targetNodeRs, item);
    if (!fs.existsSync(destItem)) {
      fs.cpSync(srcItem, destItem, { recursive: true });
    }
  }
}

// 9. Copy .env.example and clean any secrets
fs.copyFileSync(path.join(APP_ROOT, '.env.example'), path.join(DIST_DIR, '.env.example'));

// Strip any actual .env files from dist
(function stripEnv(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') stripEnv(fullPath);
    } else if (/^\.env(\..*)?$/.test(entry.name) && entry.name !== '.env.example') {
      fs.rmSync(fullPath, { force: true });
    }
  }
})(DIST_DIR);

// Create start.sh in dist
const startSh = `#!/bin/sh
export PORT="\${PORT:-3000}"
export HOSTNAME="0.0.0.0"
exec node server.js
`;
fs.writeFileSync(path.join(DIST_DIR, 'start.sh'), startSh.replace(/\r\n/g, '\n'), { mode: 0o755 });

// 10. Create root Dockerfile
const dockerfileContent = `# ==============================================================================
# Call Analysis OS V2 — Container Image
# Runs prebuilt bundle in ./dist (Zero compilation, instant startup)
# nginx listens on port 80 and reverse-proxies to Node on 127.0.0.1:3000
# ==============================================================================
FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache libc6-compat nginx su-exec tini wget \\
  && addgroup -S -g 1001 nodejs \\
  && adduser -S -u 1001 -G nodejs nextjs \\
  && mkdir -p /run/nginx \\
  && rm -f /etc/nginx/http.d/default.conf \\
  && ln -sf /dev/stdout /var/log/nginx/access.log \\
  && ln -sf /dev/stderr /var/log/nginx/error.log

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

COPY --chown=nextjs:nodejs dist/ ./
COPY nginx.conf /etc/nginx/http.d/call-analysis.conf
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN sed -i 's/\\r$//' /etc/nginx/http.d/call-analysis.conf /usr/local/bin/docker-entrypoint.sh \\
  && chmod +x /usr/local/bin/docker-entrypoint.sh \\
  && rm -f .env .env.local .env.production .env.production.local \\
  && nginx -t

EXPOSE 80 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \\
  CMD wget -qO- "http://127.0.0.1/health" >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["docker-entrypoint.sh"]
`;
fs.writeFileSync(path.join(DIST_PKG_DIR, 'Dockerfile'), dockerfileContent.replace(/\r\n/g, '\n'));

// 11. Create docker-entrypoint.sh
const entrypointContent = `#!/bin/sh
set -u

APP_PORT=3000
PUBLIC_PORT="\${PORT:-80}"
case "$PUBLIC_PORT" in
  ''|*[!0-9]*|80|"$APP_PORT") rm -f /etc/nginx/call-analysis-listen.conf ;;
  *) echo "listen $PUBLIC_PORT;" > /etc/nginx/call-analysis-listen.conf ;;
esac

if [ -z "\${DB_HOST:-}" ] && [ -z "\${DATABASE_URL:-}" ]; then
  echo "WARNING: No database configured — set DB_HOST, DB_NAME, DB_USER, DB_PASSWORD or DATABASE_URL." >&2
fi

if [ "\${MIGRATE_ON_START:-false}" = "true" ]; then
  su-exec nextjs:nodejs node /app/scripts/db.mjs migrate || { echo "ERROR: schema migration failed" >&2; exit 1; }
fi

PORT="$APP_PORT" HOSTNAME=0.0.0.0 su-exec nextjs:nodejs node /app/server.js &
APP_PID=$!

# wait up to 60s for the app before opening nginx
i=0
until wget -qO- "http://127.0.0.1:$APP_PORT/api/health" >/dev/null 2>&1 || wget -qO- "http://127.0.0.1:$APP_PORT" >/dev/null 2>&1; do
  if ! kill -0 "$APP_PID" 2>/dev/null; then echo "ERROR: App exited during startup" >&2; exit 1; fi
  i=$((i + 1)); [ "$i" -ge 60 ] && { echo "ERROR: App did not answer within 60s" >&2; break; }
  sleep 1
done

nginx -g 'daemon off;' &
NGINX_PID=$!

stop() {
  kill -TERM "$APP_PID" "$NGINX_PID" 2>/dev/null || true
}
trap stop INT TERM

while kill -0 "$APP_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep 2
done

stop
wait 2>/dev/null || true
exit 1
`;
fs.writeFileSync(path.join(DIST_PKG_DIR, 'docker-entrypoint.sh'), entrypointContent.replace(/\r\n/g, '\n'), { mode: 0o755 });

// 12. Create nginx.conf
const nginxConfContent = `# ==============================================================================
# Call Analysis OS V2 — Nginx Reverse Proxy Configuration
# ==============================================================================
upstream call_analysis_app {
    server 127.0.0.1:3000;
    keepalive 32;
    keepalive_timeout 4s;
}

map $http_x_forwarded_proto $call_analysis_forwarded_proto {
    default $http_x_forwarded_proto;
    ''      $scheme;
}
map $http_x_forwarded_host $call_analysis_forwarded_host {
    default $http_x_forwarded_host;
    ''      $host;
}

server {
    listen 80 default_server;
    include /etc/nginx/call-analysis-listen*.conf;
    server_name _;
    server_tokens off;

    client_max_body_size 250m;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml image/svg+xml;

    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $call_analysis_forwarded_proto;
    proxy_set_header X-Forwarded-Host $call_analysis_forwarded_host;

    proxy_buffer_size 128k;
    proxy_buffers 8 256k;
    proxy_busy_buffers_size 256k;
    proxy_connect_timeout 10s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
    proxy_next_upstream error timeout http_502;
    proxy_next_upstream_tries 2;

    location = /health {
        access_log off;
        proxy_pass http://call_analysis_app/api/health;
    }

    # Static assets served directly from disk
    location ^~ /_next/static/ {
        alias /app/.next/static/;
        access_log off;
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header X-Content-Type-Options "nosniff" always;
    }

    # Public static files
    location / {
        root /app/public;
        try_files $uri @call_analysis_app;
    }

    location @call_analysis_app {
        proxy_pass http://call_analysis_app;
    }
}
`;
fs.writeFileSync(path.join(DIST_PKG_DIR, 'nginx.conf'), nginxConfContent.replace(/\r\n/g, '\n'));

// 13. Create README.md
const readmeContent = `# Call Analysis OS V2 — Deployment Package

Production ready pre-built bundle with Nginx reverse proxy, PostgreSQL schema, and Docker deployment configuration.

---

## 📦 Package Contents

\`\`\`
call-analysis-dist/
├── dist/                     # Prebuilt Next.js application bundle
│   ├── server.js             # Standalone production server entrypoint
│   ├── .next/                # Production server chunks & static assets
│   ├── public/               # Public images, logos & icons
│   ├── node_modules/         # Traced production runtime dependencies
│   ├── db/                   # Database schemas & SQL dumps
│   │   ├── schema.sql        # Pure DDL table definitions (22 tables)
│   │   ├── rls.sql           # Row-Level Security policies
│   │   ├── full_dump.sql     # Complete DB dump (schema + all 75 calls & demo data)
│   │   └── schema_with_data.sql # Full setup script
│   ├── scripts/db.mjs        # Database setup and migration CLI
│   ├── start.sh              # Direct server startup script
│   └── .env.example          # Environment variables template
├── docker-entrypoint.sh      # Container supervisor (Node + Nginx)
├── Dockerfile                # Production Alpine Dockerfile (Zero build needed)
├── nginx.conf                # Nginx reverse proxy configuration (port 80 -> 3000)
└── README.md                 # Deployment & setup documentation
\`\`\`

---

## 🗄️ 1. Database Setup

The package includes complete database schemas in \`dist/db/\`:

1. **New Clean Database:**
   \`\`\`bash
   psql -h <DB_HOST> -U <DB_USER> -d <DB_NAME> -f dist/db/schema.sql
   psql -h <DB_HOST> -U <DB_USER> -d <DB_NAME> -f dist/db/rls.sql
   \`\`\`

2. **Complete Database with All Data (75 calls, agents, campaigns, users, roles):**
   \`\`\`bash
   psql -h <DB_HOST> -U <DB_USER> -d <DB_NAME> -f dist/db/schema_with_data.sql
   \`\`\`

3. **Or using the automated migration script:**
   \`\`\`bash
   cd dist
   export DATABASE_URL="postgres://<user>:<password>@<host>:5432/<dbname>"
   node scripts/db.mjs migrate
   \`\`\`

---

## 🚀 2. Deploying with Docker

Build and run using the included Dockerfile:

\`\`\`bash
# 1. Build image
docker build -t call-analysis-os:v2 .

# 2. Run container
docker run -d \\
  --name call-analysis-os \\
  -p 80:80 \\
  -e DATABASE_URL="postgres://<user>:<password>@<host>:5432/<dbname>" \\
  -e APP_ORIGIN="http://your-domain.com" \\
  -e AUTH_PEPPER="your-random-secret-pepper" \\
  -e SIGNUP_OPEN="true" \\
  --restart unless-stopped \\
  call-analysis-os:v2
\`\`\`

---

## 🌐 3. Direct Node.js Run (Without Docker)

You can also run directly on any server with Node.js 20+:

\`\`\`bash
cd dist
cp .env.example .env
# Edit .env with your DATABASE_URL and secrets
node server.js
\`\`\`
The application will listen on \`http://0.0.0.0:3000\`.
`;
fs.writeFileSync(path.join(DIST_PKG_DIR, 'README.md'), readmeContent.replace(/\r\n/g, '\n'));

console.log('\\nFiles in package:');
for (const item of fs.readdirSync(DIST_PKG_DIR)) {
  const stat = fs.statSync(path.join(DIST_PKG_DIR, item));
  console.log(` - ${item} (${stat.isDirectory() ? 'Directory' : stat.size + ' bytes'})`);
}

// 14. Create ZIP archive
console.log('\\nCreating ZIP archive: call-analysis-dist.zip...');
const zipFile = path.resolve(PROJECT_ROOT, 'call-analysis-dist.zip');
if (fs.existsSync(zipFile)) fs.rmSync(zipFile, { force: true });

try {
  // Use PowerShell Compress-Archive on Windows
  execSync(`powershell.exe -Command "Compress-Archive -Path '${DIST_PKG_DIR}\\*' -DestinationPath '${zipFile}' -Force"`, { stdio: 'inherit' });
  const zipSizeMb = (fs.statSync(zipFile).size / (1024 * 1024)).toFixed(2);
  console.log(`\\nSUCCESS: Package archived to ${zipFile} (${zipSizeMb} MB)`);
} catch (err) {
  console.log('Note: Compress-Archive failed or zip CLI not present:', err.message);
}

console.log('Done!');

