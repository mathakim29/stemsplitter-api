from collections import deque
import json
import os
from pathlib import Path
import shutil
import subprocess
import uuid

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from huey.exceptions import TaskException

from tasks import huey, process_job

EXPORT_DIR = Path("/etc/exports").resolve()
UPLOAD_DIR = Path("/tmp/uploads")
LOG_FILE_PATH = "/tmp/process.log"
JOBS_SET_KEY = "submitted_job_ids"

app = FastAPI(root_path="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "http://YOUR_SERVER_IP:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

redis_client = huey.storage.conn  # reuse huey's redis connection


@app.get("/log-pipe")
def get_last_lines():
    if not os.path.exists(LOG_FILE_PATH):
        raise HTTPException(status_code=404, detail="Log file not found.")
    try:
        with open(LOG_FILE_PATH, "r", encoding="utf-8") as f:
            last_lines = deque(f, maxlen=3)
        return {"lines": [line.strip() for line in last_lines]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file: {str(e)}")


@app.get("/ping")
def check_status():
    return {"status": "active"}


@app.post("/upload/")
async def upload_file_or_url(
    file: UploadFile = File(None),
    url: str = Form(None),
    model: str = Form("htdemucs.yaml"),
):
    if not file and not url:
        raise HTTPException(status_code=400, detail="Must provide either a file or a URL.")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    file_id = str(uuid.uuid4())

    try:
        if file and file.filename:
            file_path = UPLOAD_DIR / file_id
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            job = process_job(
                file_id,
                model,
                file_path=str(file_path),
                original_filename=file.filename,
            )
            og_name = file.filename
        else:
            job = process_job(
                file_id,
                model,
                url=url,
                original_filename=url,
            )
            og_name = url

        redis_client.sadd(JOBS_SET_KEY, job.id)

        return {
            "id": job.id,
            "og_file": og_name,
            "status": "queued",
        }

    except Exception as e:
        return {"status": "error", "stack-trace": str(e)}


@app.get("/status/{job_id}")
async def get_job_status(job_id: str):
    if not redis_client.sismember(JOBS_SET_KEY, job_id):
        raise HTTPException(status_code=404, detail="Job not found")

    try:
        result = huey.result(job_id, preserve=True)
    except TaskException as exc:
        return {"jobId": job_id, "progress": "failed", "result": None, "error": str(exc)}

    if result is None:
        return {"jobId": job_id, "progress": "started", "result": None, "error": None}

    return {
        "jobId": job_id,
        "progress": "finished",
        "result": result,
        "error": None,
    }


@app.get("/exports/{filename}")
async def download_export_file(filename: str):
    safe_path = (EXPORT_DIR / filename).resolve()
    if EXPORT_DIR not in safe_path.parents and safe_path != EXPORT_DIR:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not safe_path.is_file():
        raise HTTPException(status_code=404, detail=f"File '{filename}' not found")
    return FileResponse(safe_path, filename=filename)


@app.get("/list-models")
async def get_models(req: Request):
    output = subprocess.run(
        ["audio-separator", "--list_models", "--list_format=json"],
        capture_output=True,
        text=True,
    )
    return {"output": json.loads(output.stdout)}