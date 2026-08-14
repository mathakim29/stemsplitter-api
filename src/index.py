import shutil
import uuid
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import FileResponse
from redis import Redis
from rq import Queue
from rq.job import Job

from tasks import process_stem_separation_task

app = FastAPI(root_path="/home")

EXPORT_DIR = Path("/etc/exports").resolve()
UPLOAD_DIR = Path("/tmp/uploads")

redis_conn = Redis(host="redis", port=6379, db=0)
queue = Queue("audio-processing", connection=redis_conn)


@app.post("/upload/")
async def upload_file(
    file: UploadFile = File(...),
    model: str = Form("htdemucs.yaml"),
):
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    file_id = uuid.uuid4()
    file_path = UPLOAD_DIR / f"{file_id}_{file.filename}"

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    job = queue.enqueue(
        process_stem_separation_task,
        str(file_id),
        str(file_path),
        model,
        job_timeout="30m",
        retry=None,  # add rq.Retry(max=2) if desired
    )

    return {
        "id": str(file_id),
        "job_id": job.id,
        "status": "queued",
    }



@app.get("/status/{job_id}")
async def get_job_status(job_id: str):
    try:
        job = Job.fetch(job_id, connection=redis_conn)
    except Exception:
        raise HTTPException(status_code=404, detail="Job not found")

    return {
        "job_id": job.id,
        "status": job.get_status(),  # queued, started, finished, failed
        "result": job.result if job.is_finished else None,
        "error": str(job.exc_info) if job.is_failed else None,
    }


@app.get("/exports/{filename}")
async def download_export_file(filename: str):
    safe_path = (EXPORT_DIR / filename).resolve()

    if EXPORT_DIR not in safe_path.parents and safe_path != EXPORT_DIR:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not safe_path.is_file():
        raise HTTPException(status_code=404, detail=f"File '{filename}' not found")

    return FileResponse(safe_path, filename=filename)