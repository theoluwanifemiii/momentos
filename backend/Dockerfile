FROM node:20-alpine

WORKDIR /app

COPY prisma ./prisma
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src

RUN npx prisma generate
RUN npm run build

EXPOSE 3001

CMD ["npm", "start"]
