# Development image: runs the Vite dev server with live reload.
# Production hosting doesn't use Docker: the public site is static files on
# Cloudflare Pages, built and deployed by .github/workflows/ci.yml (see
# docs/hosting.md). This image stays dev-only.
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
