FROM node:20-alpine

WORKDIR /app/worker

COPY worker/package*.json ./
RUN npm install

COPY worker/tsconfig.json ./
COPY worker/scheduler.ts ./

COPY backend/prisma /app/backend/prisma

RUN npx prisma generate --schema=/app/backend/prisma/schema.prisma
RUN npm run build

CMD ["npm", "start"]
