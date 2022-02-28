composer install --working-dir=/var/www/html/system/
chown -R nginx:nginx /var/www/html

/usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf