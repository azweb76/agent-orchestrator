FROM node:22-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        build-essential \
        python3 \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

USER node
