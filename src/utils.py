import asyncio
import os
from fastapi.templating import Jinja2Templates
from functools import wraps
import httpx


templates = Jinja2Templates(directory="templates")
def render_template(template_name: str):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            request = kwargs.get("request")
            context = await func(*args, **kwargs) if asyncio.iscoroutinefunction(func) else func(*args, **kwargs)
            return templates.TemplateResponse(request, template_name, context)
        return wrapper
    return decorator



async def generate_content(payload: str, api_key: str = "") -> dict:
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent"
    headers = {
        "Content-Type": "application/json",
        "X-goog-api-key": os.environ.get("api_key", "0")
    }
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": payload
                    }
                ]
            }
        ]
    }

    # Use AsyncClient for non-blocking asynchronous requests
    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers, json=payload)
        return response.json()