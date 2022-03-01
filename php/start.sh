composer install --working-dir=/var/www/html/system/
composer update --working-dir=/var/www/html/system/
chown -R nginx:nginx /var/www/html

screen -S firewall -dm php /var/www/html/system/firewall.php
screen -S monitoring -dm php /var/www/html/system/monitoring.php

/usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf