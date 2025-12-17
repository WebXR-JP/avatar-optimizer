# syntax=docker/dockerfile:1

ARG VARIANT="1-22-bookworm"
FROM mcr.microsoft.com/devcontainers/typescript-node:${VARIANT}

USER root

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git \
    unzip \
    # Playwright Chromium依存関係
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
