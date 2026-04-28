FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git curl procps python3 ca-certificates jq \
  && rm -rf /var/lib/apt/lists/*

ARG OPENCLAW_PACKAGE=openclaw@2026.4.22
RUN npm install -g ${OPENCLAW_PACKAGE}

RUN mkdir -p /root/.openclaw/workspace/memory
WORKDIR /root/.openclaw/workspace

CMD ["openclaw", "gateway", "run"]
