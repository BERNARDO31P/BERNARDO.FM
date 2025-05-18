FROM trafex/php-nginx:latest

COPY ./nginx.conf /etc/nginx/nginx.conf
COPY --from=composer:latest /usr/bin/composer /usr/local/bin/composer

USER root
RUN rm -rf /etc/nginx/conf.d/default.conf

RUN apk --no-cache add  \
    php81-pecl-imagick php81-fileinfo php81-pcntl php81-pecl-memcached \
    git screen ffmpeg imagemagick

RUN echo "user = nginx" >> /etc/php81/php-fpm.d/www.conf
RUN echo "listen.owner = nginx" >> /etc/php81/php-fpm.d/www.conf
RUN echo "listen.group = nginx" >> /etc/php81/php-fpm.d/www.conf
RUN echo "listen.mode = 0660" >> /etc/php81/php-fpm.d/www.conf

COPY ./php.ini /etc/php81/php.ini

COPY start.sh /
RUN chmod +x /start.sh

CMD ["sh", "-c", "/start.sh"]