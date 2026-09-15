FROM nginx:1.30.4-alpine-slim
LABEL maintainer="JetDeploy"

COPY default.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html

RUN sed -i '/^user /d; s#pid .*#pid /tmp/nginx.pid;#' /etc/nginx/nginx.conf \
    && chown -R nginx:nginx /var/cache/nginx /etc/nginx/conf.d

USER nginx
EXPOSE 8080
