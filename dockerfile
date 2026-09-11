FROM beveradb/audio-separator:gpu-0.27.1

copy requirements.txt .
run pip install --break-system-packages -r requirements.txt


workdir /workspace
copy . /workspace

entrypoint []
CMD ["uvicorn", "index:app", "--host", "0.0.0.0", "--port", "8000"]