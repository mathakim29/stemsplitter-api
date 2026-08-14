import asyncio
from audio_separator.separator import Separator

def get_separator() -> Separator:
    # fresh instance per call -> process-safe
    return Separator(output_dir="/etc/exports", model_file_dir="/etc/models")
    
def stemprocess(file_id: str, filename: str, model_name: str):
    try:
        time_start = get_time()
        separator = get_separator()    
        separator.load_model(model_name)
        output_files = separator.separate(filename)
        time_done = get_time()
        return {"status": "completed", "time_start": time_start, "time_done": time_done, "file_id": file_id, "output_files": output_files}
    except Exception as e:
        return {"status": "error", "stack-trace": str(e)}

def get_time():
    from datetime import datetime, timezone

    # Get current time in UTC with ISO format string
    time = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return time


    
    
 