#!/bin/bash

folder="/var/www/beta/app/system/";
#folder="/home/bernardo/PhpstormProjects/BERNARDO.FM/app/system/";

int=$(ip route get 8.8.8.8 | awk -- '{printf $5}');

while true
do
 free > ${folder}data/free
 cat /proc/stat > ${folder}data/stat
 cat /sys/class/net/${int}/statistics/rx_bytes > ${folder}data/rx_bytes
 cat /sys/class/net/${int}/statistics/tx_bytes > ${folder}data/tx_bytes

 (iptables -t raw -L -v | sed '/^[[:space:]]*$/d') > ${folder}data/raw
 (iptables -t mangle -L -v | sed '/^[[:space:]]*$/d') > ${folder}data/mangle
 (iptables -t nat -L -v | sed '/^[[:space:]]*$/d') > ${folder}data/nat
 (iptables -t filter -L -v | sed '/^[[:space:]]*$/d') > ${folder}data/filter

 sleep 1
done
