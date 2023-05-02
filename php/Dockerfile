FROM trafex/php-nginx:latest

ADD ./nginx.conf /etc/nginx/nginx.conf

COPY --from=composer:latest /usr/bin/composer /usr/local/bin/composer
#RUN composer install --working-dir=/var/www/html/system/

USER root
RUN rm -rf /etc/nginx/conf.d/default.conf

# RUN apk add --no-cache php7-pear php7-dev gcc musl-dev make php-ssl

RUN apk --no-cache add php81-pecl-imagick php81-fileinfo git screen ffmpeg

RUN echo "user = nginx" >> /etc/php81/php-fpm.d/www.conf
RUN echo "listen.owner = nginx" >> /etc/php81/php-fpm.d/www.conf
RUN echo "listen.group = nginx" >> /etc/php81/php-fpm.d/www.conf
RUN echo "listen.mode = 0660" >> /etc/php81/php-fpm.d/www.conf

COPY start.sh /
RUN chmod +x /start.sh

CMD ["sh", "-c", "/start.sh"]