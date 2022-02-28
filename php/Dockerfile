FROM trafex/php-nginx:latest

ADD ./nginx.conf /etc/nginx/nginx.conf
COPY --from=composer:latest /usr/bin/composer /usr/local/bin/composer
#RUN composer install --working-dir=/var/www/html/system/

USER root

# RUN apk add --no-cache php7-pear php7-dev gcc musl-dev make php-ssl

RUN apk --no-cache add php8-pecl-imagick

RUN apk add php8-fileinfo
RUN apk add git

RUN echo "user = nginx" >> /etc/php8/php-fpm.d/www.conf
RUN echo "listen.owner = nginx" >> /etc/php8/php-fpm.d/www.conf
RUN echo "listen.group = nginx" >> /etc/php8/php-fpm.d/www.conf
RUN echo "listen.mode = 0660" >> /etc/php8/php-fpm.d/www.conf

COPY start.sh /
RUN chmod +x /start.sh

CMD ["sh", "-c", "/start.sh"]