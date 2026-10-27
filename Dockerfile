FROM node:24-alpine
WORKDIR /app
COPY package.json *.mjs ./
COPY public ./public
ENV HOST=0.0.0.0 PORT=3000 DATA_DIR=/data COOKIE_SECURE=true
EXPOSE 3000
CMD ["node", "server.mjs"]
