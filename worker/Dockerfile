FROM node:20-slim

# Install OpenSSL and other dependencies for Prisma
RUN apt-get update && apt-get install -y \
    openssl \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/worker

# Set Prisma binary targets for Railway/Debian
ENV PRISMA_CLI_BINARY_TARGETS=debian-openssl-1.1.x

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY scheduler.ts ./
COPY prisma ./prisma

# Generate Prisma Client with explicit binary target
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npm run build

CMD ["npm", "start"]
