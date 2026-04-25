FROM node:20-alpine AS builder
WORKDIR /app
ARG VITE_API_URL=/api
ARG VITE_AUTH_BACKEND=supabase
ARG VITE_VPS_API_BASE=https://api.sanitileserp.com
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_AUTH_BACKEND=$VITE_AUTH_BACKEND
ENV VITE_VPS_API_BASE=$VITE_VPS_API_BASE
COPY package.json bun.lockb ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
