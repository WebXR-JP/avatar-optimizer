# syntax=docker/dockerfile:1

ARG VARIANT="1-22-bookworm"
FROM mcr.microsoft.com/devcontainers/typescript-node:${VARIANT}

USER root

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git \
    unzip \
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
