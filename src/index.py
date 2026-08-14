import shutil
import uuid
from pathlib import Path
import json

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware



from redis import Redis
from rq import Queue
from rq.job import Job
from tasks import stemprocess

app = FastAPI(root_path="/api")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "http://YOUR_SERVER_IP:8000",
        # "https://your-domain.example",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

EXPORT_DIR = Path("/etc/exports").resolve()
UPLOAD_DIR = Path("/tmp/uploads")

redis_conn = Redis(host="redis", port=6379, db=0)
queue = Queue("audio-processing", connection=redis_conn)


@app.post("/upload/")
async def upload_file(
    file: UploadFile = File(...),
    model: str = Form("htdemucs.yaml"),
):

    try:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        file_id = uuid.uuid4()
        file_path = UPLOAD_DIR / f"{file_id}"

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        job = queue.enqueue(
            stemprocess,
            str(file_id),
            str(file_path),
            model,
            job_timeout="30m",
            retry=None,  # add rq.Retry(max=2) if desired
            job_id=str(file_id)
        )

        return {
            "id": job.id,
            "og_file": file.filename,
            "status": "queued"
        }
    except Exception as e:
        return {"status": "error", "stack-trace": str(e)}



@app.get("/status/{job_id}")
async def get_job_status(job_id: str):
    try:
        job = Job.fetch(job_id, connection=redis_conn)
    except Exception:
        raise HTTPException(status_code=404, detail="Job not found")

    return {
        "jobId": job.id,
        "progress": job.get_status(),  # queued, started, finished, failed
        "result": job.result if job.is_finished else None,
        "error": str(job.exc_info) if job.is_failed else None
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
    import subprocess
    output = subprocess.run(["audio-separator", "--list_models", "--list_format=json"], capture_output=True, text=True)
    return {'output': json.loads(str(output.stdout))}
    