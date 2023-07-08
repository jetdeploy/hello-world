FROM nginx:latest
LABEL maintainer="jetdeploy.com"
ENV NGINX_PORT 8080
COPY templates /etc/nginx/templates
COPY index.html /usr/share/nginx/html/index.html
COPY script.sh /
