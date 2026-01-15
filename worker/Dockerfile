FROM node:20-alpine

WORKDIR /app/worker

COPY worker/package*.json ./
RUN npm install

COPY worker/tsconfig.json ./
COPY worker/scheduler.ts ./
COPY worker/prisma ./prisma

RUN npx prisma generate --schema=prisma/schema.prisma
RUN npm run build

CMD ["npm", "start"]
