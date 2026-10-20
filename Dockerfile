# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY frontend ./
RUN pnpm run check && pnpm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AEROMIND_ENV=production \
    PORT=10000
WORKDIR /app

RUN addgroup --system aeromind && adduser --system --ingroup aeromind aeromind
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY web ./web
COPY sitl_modules ./sitl_modules
COPY main.py README.md ./.env.example ./
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
RUN mkdir -p data logs && chown -R aeromind:aeromind /app
USER aeromind
EXPOSE 10000

CMD ["sh", "-c", "uvicorn web.app:app --host 0.0.0.0 --port ${PORT:-10000}"]
