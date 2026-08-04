#!/bin/bash

folder="/var/www/beta/app/system/";
#folder="/home/bernardo/PhpstormProjects/BERNARDO.FM/app/system/";

int=$(ip route get 8.8.8.8 | awk -- '{printf $5}');

if ! iptables -w -t filter -C INPUT -i ${int} -m comment --comment "monitoring" -j ACCEPT >/dev/null 2>&1
then
 iptables -w -t filter -I INPUT 1 -i ${int} -m comment --comment "monitoring" -j ACCEPT
fi

while true
do
 free > ${folder}data/free
 cat /proc/stat > ${folder}data/stat
 cat /sys/class/net/${int}/statistics/rx_bytes > ${folder}data/rx_bytes
 cat /sys/class/net/${int}/statistics/tx_bytes > ${folder}data/tx_bytes

 (iptables -t raw -L -n -v | sed '/^[[:space:]]*$/d') > ${folder}data/raw
 (iptables -t mangle -L -n -v | sed '/^[[:space:]]*$/d') > ${folder}data/mangle
 (iptables -t nat -L -n -v | sed '/^[[:space:]]*$/d') > ${folder}data/nat
 (iptables -t filter -L -n -v | sed '/^[[:space:]]*$/d') > ${folder}data/filter
 (iptables -t filter -L INPUT -n -v -x | sed '/^[[:space:]]*$/d') > ${folder}data/filter_network

 sleep 0.5
done
