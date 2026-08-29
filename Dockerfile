# ─── Estágio 1: build (compila o Angular em modo produção) ───
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build:prod

# ─── Estágio 2: runtime (nginx servindo os estáticos) ───
FROM nginx:alpine
# O builder "application" do Angular 18 gera os estáticos em dist/<projeto>/browser.
COPY --from=build /app/dist/mmail/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
