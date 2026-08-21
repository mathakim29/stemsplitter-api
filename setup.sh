#!/bin/bash

# 1. Start processes in the background, writing to the log file
(rq worker audio-processing & hypercorn index:app --bind 0.0.0.0:8000 ${MODE:+$( [ "$MODE" = "DEV" ] && echo "--reload" )}) > /tmp/process.log 2>&1 &

# 2. Give it a second to create the file
sleep 1

# 3. Keep container alive and stream logs to 'docker logs'
tail -f /tmp/process.log
