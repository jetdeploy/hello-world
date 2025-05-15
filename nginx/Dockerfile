FROM nginx:latest
LABEL maintainer="JetDeploy"

ENV NGINX_PORT=8080

COPY default.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
