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
# A imagem oficial do nginx processa /etc/nginx/templates/*.template no start,
# substituindo variáveis de ambiente e escrevendo em /etc/nginx/conf.d/.
COPY default.conf.template /etc/nginx/templates/default.conf.template

# Sem o FILTER, o envsubst apagaria também as variáveis do próprio nginx ($host, $uri...),
# porque elas não existem no ambiente. Assim só BACKEND_UPSTREAM é substituída.
ENV NGINX_ENVSUBST_FILTER=BACKEND_UPSTREAM     BACKEND_UPSTREAM=backend:3000

EXPOSE 80
