import asyncio
from audio_separator.separator import Separator

def get_separator() -> Separator:
    # fresh instance per call -> process-safe
    return Separator(output_dir="/etc/exports", model_file_dir="/etc/models")
    
 
 
def process_stem_separation_task(file_id: str, filename: str, model_name: str = "htdemucs.yaml"):
    separator = get_separator()
 
    def progress_callback(progress: float):
        pct = int(progress * 100) if progress <= 1 else int(progress)
        print(f"[{file_id}] Separation Progress: {pct}%")
 
    separator.load_model(model_name)
    output_files = separator.separate(filename)
 
    return {"status": "completed", "file_id": file_id, "output_files": output_files}
 