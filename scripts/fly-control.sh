#!/bin/bash

# Fly.io Machine Control Script
# 使用方法: ./fly-control.sh [start|stop|status]

APP_NAME="timelogger-bitter-resonance-9585"
MACHINE_ID="3287ee1fd15698"

case "$1" in
    start)
        echo "Starting TimeLogger bot..."
        fly machine start $MACHINE_ID -a $APP_NAME
        ;;
    stop)
        echo "Stopping TimeLogger bot..."
        fly machine stop $MACHINE_ID -a $APP_NAME
        ;;
    status)
        echo "Checking TimeLogger bot status..."
        fly machine status $MACHINE_ID -a $APP_NAME
        ;;
    *)
        echo "使用方法: $0 {start|stop|status}"
        exit 1
        ;;
esac