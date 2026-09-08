FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .

ENV DATABASE_URL=postgresql://postgres:postgres@db:5432/mbile_erp?schema=public
RUN npx prisma generate && npm run web:build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma
ENV DATABASE_URL=postgresql://postgres:postgres@db:5432/mbile_erp?schema=public
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/server-dist ./server-dist

EXPOSE 3001
CMD ["sh", "-c", "npx prisma db push --skip-generate && node server-dist/server/index.js"]
