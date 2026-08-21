import asyncio
import logging
from logging.handlers import QueueHandler, QueueListener
import queue
import httpx

# 1. Define a custom Handler that sends logs via HTTPX
class AsyncHTTPHandler(logging.Handler):
    def __init__(self, endpoint_url: str):
        super().__init__()
        self.endpoint_url = endpoint_url
        # Use a sync client inside the background thread listener
        self.client = httpx.Client(timeout=2.0)

    def emit(self, record):
        log_entry = self.format(record)
        payload = {
            "level": record.levelname,
            "logger": record.name,
            "message": log_entry,
            "timestamp": record.created
        }
        try:
            # Sends the JSON payload to your log server
            self.client.post(self.endpoint_url, json=payload)
        except Exception:
            self.handleError(record)

    def close(self):
        self.client.close()
        super().close()

# 2. Setup the non-blocking Queue system
log_queue = queue.Queue(-1)  # Infinite queue size
queue_handler = QueueHandler(log_queue)

# Target endpoint for your logs
http_target_handler = AsyncHTTPHandler("https://your-logging-endpoint.com")
http_target_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))

# The listener runs in a background thread and processes the queue
listener = QueueListener(log_queue, http_target_handler)

def setup_logging():
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(queue_handler)
    
    # Start listening to the queue
    listener.start()

def stop_logging():
    # Flush remaining logs and stop the thread safely on shutdown
    listener.stop()
