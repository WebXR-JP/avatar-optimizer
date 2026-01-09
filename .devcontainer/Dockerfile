# syntax=docker/dockerfile:1

ARG VARIANT="1-22-bookworm"
FROM mcr.microsoft.com/devcontainers/typescript-node:${VARIANT}

USER root

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git \
    unzip \
    # socat: CDP ポートフォワード用 (localhost:9223 → host.docker.internal:9222)
    socat \
    # Chromium ブラウザ (WSLg 経由で GUI 表示可能)
    chromium \
    # Playwright/Chromium 依存関係
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    # X11/WSLg GUI 表示用
    libx11-6 \
    libxext6 \
    libxi6 \
    libxtst6 \
    libxrender1 \
    libxss1 \
    fonts-liberation \
    fonts-noto-cjk \
    # GPU/OpenGL/Vulkan サポート
    mesa-utils \
    libgl1-mesa-dri \
    libgl1-mesa-glx \
    libegl1 \
    # Vulkan (NVIDIA GPU用)
    mesa-vulkan-drivers \
    libvulkan1 \
    vulkan-tools \
    # Mesa D3D12バックエンド (WSLg用)
    libd3dadapter9-mesa \
  && rm -rf /var/lib/apt/lists/*

USER node

# Install AI agent CLIs globally so every user in the container can invoke them.
RUN npm install -g \
    pnpm \
    @anthropic-ai/claude-code \
    @google/gemini-cli \
    @openai/codex \
    opencode-ai \
    @gltf-transform/cli

RUN echo "alias codex='codex --yolo'" >> /home/node/.bashrc
