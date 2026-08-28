import logging
from pathlib import Path
import subprocess
import re

from audio_separator.separator import Separator
from huey import RedisHuey

huey = RedisHuey('audio-processing', host='redis', port=6379, db=0)

UPLOAD_DIR = Path("/tmp/uploads")
EXPORT_DIR = Path("/etc/exports")
LOG_FILE_PATH = Path("/tmp/process.log")


def configure_logger():
    logging.basicConfig(
        filename=LOG_FILE_PATH,
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s",
        force=True,
    )


def get_separator() -> Separator:
    return Separator(output_dir=str(EXPORT_DIR), model_file_dir="/etc/models")


def get_video_title_and_id(url: str) -> tuple[str, str]:
    """
    Extract video title and ID from YouTube URL without downloading.
    Returns: (sanitized_title, video_id)
    """
    cmd = [
        "yt-dlp",
        "--print", "title",
        "--print", "id",
        "--no-playlist",
        url,
    ]
    
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        logging.error(f"Failed to get video metadata: {proc.stderr}")
        raise RuntimeError(f"Failed to get video metadata: {proc.stderr}")
    
    output = proc.stdout.strip().split('\n')
    title = output[0] if len(output) > 0 else "unknown"
    video_id = output[1] if len(output) > 1 else "unknown"
    
    # Sanitize filename (remove invalid characters)
    sanitized = re.sub(r'[<>:"/\\|?*]', '_', title)
    # Limit filename length (optional)
    if len(sanitized) > 200:
        sanitized = sanitized[:200]
    
    return sanitized, video_id


def _download_best_audio(file_id: str, url: str) -> tuple[str, str]:
    """
    Download highest quality audio in its native format (Opus/WebM preferred).
    Returns: (file_path, video_title)
    """
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    
    # First, get video metadata
    video_title, video_id = get_video_title_and_id(url)
    logging.info(f"Video title: {video_title}, ID: {video_id}")
    
    output_template = str(UPLOAD_DIR / f"{file_id}.%(ext)s")

    # Download best audio quality with format preference
    # Priority: Opus (webm) > AAC (m4a) > any other format
    cmd = [
        "yt-dlp",
        "-f", "bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio",
        "-x",  # Extract audio
        "--audio-format", "wav",  # Convert to WAV for consistency
        "--audio-quality", "0",  # Best quality (0 = best)
        "-o", output_template,
        "--no-playlist",
        url,
    ]

    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        logging.error(f"yt-dlp error for job {file_id}: {proc.stderr}")
        raise RuntimeError(f"yt-dlp download failed: {proc.stderr}")

    # Check for possible different extensions
    possible_files = list(UPLOAD_DIR.glob(f"{file_id}.*"))
    if not possible_files:
        raise FileNotFoundError("Audio extraction failed: file not found.")
    
    file_path = str(possible_files[0])
    logging.info(f"Downloaded audio file: {file_path}")

    return file_path, video_title


@huey.task(timeout=1800, retries=0)
def process_job(
    file_id: str,
    model_name: str,
    url: str = None,
    file_path: str = None,
    original_filename: str = None,
):
    """
    Single task: handles both 'download from URL' and 'use uploaded file' cases,
    then runs stem separation. Nothing is passed between huey tasks, so nothing
    unpicklable (Result objects, locks, etc) ever ends up in task args.
    """
    configure_logger()

    video_title = None
    
    try:
        if url and not file_path:
            logging.info(f"Downloading best audio from URL for job {file_id}")
            file_path, video_title = _download_best_audio(file_id, url)
            logging.info(f"Download complete for job {file_id}")
            
            # Use the video title as original_filename if not provided
            if not original_filename:
                original_filename = video_title

        if not file_path:
            raise ValueError("No file_path or url provided to process_job")

        logging.info(f"Starting stem separation for job {file_id} using model {model_name}")

        separator = get_separator()
        separator.load_model(model_name)
        output_files = separator.separate(file_path)

        if original_filename:
            metadata_file = EXPORT_DIR / f"{file_id}.meta"
            with open(metadata_file, "w") as f:
                f.write(original_filename)

        logging.info(f"Completed separation for job {file_id}")

        return {
            "status": "completed",
            "file_id": file_id,
            "output_files": output_files,
            "filename": original_filename,
            "video_title": video_title if url else None,
            "video_id": get_video_title_and_id(url)[1] if url else None,
        }

    except Exception as e:
        logging.error(f"Error processing job {file_id}: {str(e)}")
        raise