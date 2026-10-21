FROM node:24-bookworm
RUN apt-get update \
    && apt-get install -y --no-install-recommends git procps python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
