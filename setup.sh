#!/bin/bash

# Start Huey consumer and Hypercorn in the background, redirect all output to log file
(
    # Huey consumer (adjust the module name to your FastAPI file, e.g., "main.huey" if file is main.py)
    huey_consumer tasks.huey &

    # FastAPI server (Hypercorn)
    hypercorn index:app --bind 0.0.0.0:8000 ${MODE:+$( [ "$MODE" = "DEV" ] && echo "--reload" )}
) > /tmp/process.log 2>&1 &

# Wait a moment for the log file to be created
sleep 1

# Keep the container alive and stream logs to stdout (for docker logs)
tail -f /tmp/process.log