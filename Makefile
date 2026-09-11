build:
	docker build -t asep-api:v4 . 
run:
	docker run -d -p 8000:8000 --gpus all --name asep-api asep-api:v4  
stop:
	docker rm -f asep-api 2>/dev/null || true