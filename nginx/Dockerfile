FROM nginx:latest
LABEL maintainer="JetDeploy"

ENV NGINX_PORT 8080

COPY templates /etc/nginx/templates
COPY index.html /usr/share/nginx/html/index.html
COPY script.sh /
