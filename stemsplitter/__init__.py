import logging
import json
import os
import shutil
import subprocess
from datetime import datetime
from enum import Enum
from typing import Optional

import yt_dlp
from fastapi import BackgroundTasks, FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from audio_separator.separator import Separator

from snowflake import SnowflakeGenerator


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("audio_separator_api")

app = FastAPI(title="Audio Separator API")
app.mount("/demo", StaticFiles(directory="demo", html=True), name="demo")

OUTPUT_DIR = "/var/tmp/asep"
os.makedirs(OUTPUT_DIR, exist_ok=True)

gen = SnowflakeGenerator(instance=1)

# In-memory job store: {job_id: {status, progress, outputs, error, ...}}
JOBS: dict[str, dict] = {}


def _load_model_names() -> dict[str, str]:
    result = subprocess.run(
        ["audio-separator", "-l", "--list_format", "json"],
        check=True,
        capture_output=True,
        text=True,
    )
    catalog = json.loads(result.stdout)
    return {
        name: model["filename"]
        for category in catalog.values()
        for name, model in category.items()
        if model.get("filename")
    }


MODEL_NAMES = _load_model_names()
ModelName = Enum("ModelName", {name: name for name in MODEL_NAMES}, type=str)
DEFAULT_MODEL_NAME = next(
    name for name, filename in MODEL_NAMES.items()
    if filename == "UVR-MDX-NET-Inst_HQ_3.onnx"
)


def new_job_id() -> str:
    return str(next(gen))


def download_url(url: str, job_dir: str) -> str:
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": os.path.join(job_dir, "%(id)s.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        return ydl.prepare_filename(info)


def run_separation(job_id: str, input_path: str, job_dir: str, model_name: str):
    JOBS[job_id]["status"] = "processing"
    JOBS[job_id]["started_at"] = datetime.utcnow().isoformat()
    logger.info(f"[{job_id}] Started separation | file={input_path} model={model_name}")
    try:
        sep = Separator(output_dir=job_dir, log_level=logging.INFO)
        sep.load_model(model_filename=model_name)
        outputs = sep.separate(input_path)

        JOBS[job_id].update(
            status="done",
            progress=100,
            outputs=outputs,
            finished_at=datetime.utcnow().isoformat(),
        )
        logger.info(f"[{job_id}] Done | outputs={outputs}")
    except Exception as e:
        JOBS[job_id].update(
            status="failed",
            error=str(e),
            finished_at=datetime.utcnow().isoformat(),
        )
        logger.error(f"[{job_id}] Failed | error={e}")


def run_url_separation(job_id: str, url: str, job_dir: str, model_name: str):
    JOBS[job_id]["status"] = "downloading"
    try:
        input_path = download_url(url, job_dir)
        JOBS[job_id]["filename"] = os.path.basename(input_path)
    except Exception as e:
        JOBS[job_id].update(
            status="failed",
            error=f"download error: {e}",
            finished_at=datetime.utcnow().isoformat(),
        )
        return
    run_separation(job_id, input_path, job_dir, model_name)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/models")
def list_models():
    result = subprocess.run(
        ["audio-separator", "-l", "--list_format", "json"],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


@app.post("/separate")
async def separate(
    background_tasks: BackgroundTasks,
    file: Optional[UploadFile] = File(None),
    url: Optional[str] = Form(None),
    model_name: ModelName = Form(ModelName(DEFAULT_MODEL_NAME)),
):
    if not file and not url:
        raise HTTPException(400, "Provide either a file or a url")
    if file and url:
        raise HTTPException(400, "Provide only one of file or url")

    model_filename = MODEL_NAMES[model_name.value]

    job_id = new_job_id()
    job_dir = os.path.join(OUTPUT_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    if file:
        if not file.filename:
            raise HTTPException(400, "No file provided")
        input_path = os.path.join(job_dir, file.filename)
        with open(input_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        JOBS[job_id] = {
            "status": "queued",
            "progress": 0,
            "filename": file.filename,
            "created_at": datetime.utcnow().isoformat(),
        }
        background_tasks.add_task(run_separation, job_id, input_path, job_dir, model_filename)
    else:
        JOBS[job_id] = {
            "status": "queued",
            "progress": 0,
            "filename": url,
            "created_at": datetime.utcnow().isoformat(),
        }
        background_tasks.add_task(run_url_separation, job_id, url, job_dir, model_filename)

    return {"job_id": job_id, "status": "queued"}


@app.get("/status/{job_id}")
def status(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return {"job_id": job_id, **job}


@app.get("/jobs")
def list_jobs():
    return JOBS


@app.get("/download/{job_id}/{filename}")
def download(job_id: str, filename: str):
    path = os.path.join(OUTPUT_DIR, job_id, filename)
    if not os.path.exists(path):
        raise HTTPException(404, "File not found")
    return FileResponse(path, filename=filename)
