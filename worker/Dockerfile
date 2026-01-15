FROM node:20-alpine

WORKDIR /app/worker

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY scheduler.ts ./
COPY prisma ./prisma

RUN npx prisma generate --schema=prisma/schema.prisma
RUN npm run build

CMD ["npm", "start"]
