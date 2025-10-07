# ---------- 构建阶段 ----------
FROM node:20-alpine AS builder

WORKDIR /app

RUN npm config set registry https://registry.npmmirror.com \
    && npm install -g pnpm \
    && pnpm config set registry https://registry.npmmirror.com

COPY package.json pnpm-lock.yaml* tsconfig.json ./

RUN pnpm install

COPY src ./src

RUN pnpm run build


# ---------- 运行阶段 ----------
FROM node:20-alpine

WORKDIR /app

RUN npm config set registry https://registry.npmmirror.com \
    && npm install -g pnpm \
    && pnpm config set registry https://registry.npmmirror.com

COPY package.json pnpm-lock.yaml* ./

RUN pnpm install --prod

COPY --from=builder /app/dist ./dist
EXPOSE 18080

# 启动命令
CMD ["pnpm", "run", "start"]
