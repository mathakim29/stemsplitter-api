document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        inputType: 'url',
        file: null,
        audioUrl: 'https://www.youtube.com/watch?v=B9WsjlqjYjg',
        
        modelList: [],
        selectedModel: 'UVR-MDX-NET-Inst_HQ_3.onnx',
        
        isProcessing: false,
        jobId: null,
        jobStatus: 'idle',
        progress: 0,
        errorMessage: '',
        outputs: [],
        logs: [],
        
        wavesurferInstances: [],
        playingStates: {},
        currentTimes: {},
        durations: {},

        savedJobs: [],
        selectedHistoryJob: '',

        async initApp() {
            await this.loadCookies();
            await this.fetchModels();
            this.$nextTick(() => lucide.createIcons());
        },

        async fetchModels() {
            try {
                const res = await fetch('http://localhost:8000/models', { headers: { 'accept': 'application/json' } });
                if (!res.ok) throw new Error(`Model list request failed: ${res.status}`);

                const modelCatalog = await res.json();
                this.modelList = Object.entries(modelCatalog).flatMap(([category, models]) =>
                    Object.entries(models).map(([label, model]) => ({
                        category,
                        label: `${label} (${model.filename})`,
                        filename: model.filename,
                    }))
                );

                if (!this.modelList.some(model => model.filename === this.selectedModel)) {
                    this.selectedModel = this.modelList[0]?.filename || '';
                }
            } catch (error) {
                console.error('Failed to fetch models:', error);
                this.errorMessage = 'Failed to load available models.';
            }
        },

        async startSeparation() {
            this.errorMessage = '';
            const formData = new FormData();

            if (this.inputType === 'url') {
                if (!this.audioUrl.trim()) {
                    this.errorMessage = 'Please enter a valid Audio URL.';
                    return;
                }
                formData.append('url', this.audioUrl);
            } else if (this.inputType === 'file') {
                if (!this.file) {
                    this.errorMessage = 'Please select a file to upload.';
                    return;
                }
                formData.append('file', this.file);
            }

            formData.append('model_name', this.selectedModel);

            try {
                this.isProcessing = true;
                this.jobStatus = 'uploading';
                this.clearPlayerState();

                const response = await fetch('http://localhost:8000/separate', {
                    method: 'POST',
                    headers: { 'accept': 'application/json' },
                    body: formData
                });
                
                const data = await response.json();

                if (!response.ok) {
                    const detail = data.detail ? JSON.stringify(data.detail) : 'Unknown server error';
                    throw new Error(`Server responded with ${response.status}: ${detail}`);
                }

                this.jobId = data.job_id; 
                this.jobStatus = data.status;
                this.logs = data.logs || [];

                if (this.jobId) this.pollStatus();
            } catch (error) {
                console.error('Separation failed:', error);
                this.errorMessage = error.message || 'Failed to connect to the server.';
                this.isProcessing = false;
                this.jobStatus = 'failed';
            }
        },

        pollStatus() {
            const interval = setInterval(async () => {
                try {
                    const res = await fetch(`http://localhost:8000/status/${this.jobId}`, { headers: { 'accept': 'application/json' } });
                    const data = await res.json();
                    
                    if (!res.ok) {
                        throw new Error(data.detail ? JSON.stringify(data.detail) : 'Failed to fetch status');
                    }

                    this.jobStatus = data.status;
                    this.progress = data.progress || 0;
                    this.logs = data.logs || [];
                    this.$nextTick(() => lucide.createIcons());

                    if (data.status === 'done' || data.status === 'completed') {
                        clearInterval(interval);
                        this.isProcessing = false;
                        this.outputs = data.outputs || [];
                        this.saveJobToCookies(this.jobId, this.outputs);
                    } else if (data.status === 'failed') {
                        clearInterval(interval);
                        this.isProcessing = false;
                        this.errorMessage = data.error || 'Job failed on the server.';
                    }
                } catch (err) {
                    console.error('Error polling status:', err);
                    clearInterval(interval);
                    this.isProcessing = false;
                    this.errorMessage = err.message || 'Connection lost while polling status.';
                }
            }, 3000);
        },

        getCssVar(name) {
            return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        },

        clearPlayerState() {
            this.wavesurferInstances.forEach(ws => ws && ws.destroy());
            this.wavesurferInstances = [];
            this.outputs = [];
            this.playingStates = {};
            this.currentTimes = {};
            this.durations = {};
        },

        initWaveform(index, filename) {
            const audioUrl = `http://localhost:8000/download/${this.jobId}/${filename}`;
            
            const ws = WaveSurfer.create({
                container: `#waveform-${index}`,
                url: audioUrl,
                waveColor: this.getCssVar('--wave-color') || '#cbd5e1',
                progressColor: this.getCssVar('--progress-color') || '#3b82f6',
                cursorColor: this.getCssVar('--cursor-color') || '#1d4ed8',
                barWidth: 3,
                barGap: 2,
                height: 60,
                plugins: [
                    WaveSurfer.Hover.create({ 
                        lineColor: this.getCssVar('--hover-line-color') || '#ef4444', 
                        lineWidth: 2, 
                        labelBackground: this.getCssVar('--hover-bg-color') || '#1e293b', 
                        labelColor: this.getCssVar('--hover-text-color') || '#fff', 
                        labelSize: '11px' 
                    })
                ]
            });

            ws.on('ready', () => this.durations[index] = ws.getDuration());
            ws.on('audioprocess', (time) => this.currentTimes[index] = time);
            ws.on('seeking', (time) => this.currentTimes[index] = time);
            ws.on('play', () => this.playingStates[index] = true);
            ws.on('pause', () => this.playingStates[index] = false);
            ws.on('finish', () => this.playingStates[index] = false);

            this.wavesurferInstances[index] = ws;
        },

        togglePlay(index) {
            const ws = this.wavesurferInstances[index];
            if (ws) ws.playPause();
        },

        playAll() { this.wavesurferInstances.forEach(ws => ws && ws.play()); },
        pauseAll() { this.wavesurferInstances.forEach(ws => ws && ws.pause()); },
        resetAll() { 
            this.wavesurferInstances.forEach(ws => {
                if (ws) {
                    ws.pause();
                    ws.setTime(0);
                }
            }); 
        },
        
        downloadTrack(filename) {
            const url = `http://localhost:8000/download/${this.jobId}/${filename}`;
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        },

        downloadAll() {
            this.outputs.forEach(filename => this.downloadTrack(filename));
        },

        saveJobToCookies(jobId, outputs) {
            if (!this.savedJobs.find(j => j.jobId === jobId)) {
                this.savedJobs.unshift({ jobId, outputs });
                if (this.savedJobs.length > 10) this.savedJobs.pop();
                document.cookie = `audio_jobs=${encodeURIComponent(JSON.stringify(this.savedJobs))}; max-age=31536000; path=/`;
            }
        },

        async loadCookies() {
            const match = document.cookie.match(new RegExp('(^| )audio_jobs=([^;]+)'));
            let parsedJobs = [];
            
            if (match) {
                try {
                    parsedJobs = JSON.parse(decodeURIComponent(match[2]));
                    if (!Array.isArray(parsedJobs)) parsedJobs = [];
                } catch(e) {}
            }

            this.savedJobs = [];
            
            for (const job of parsedJobs) {
                try {
                    const statusRes = await fetch(`http://localhost:8000/status/${job.jobId}`, { 
                        method: 'GET',
                        headers: { 'accept': 'application/json' }
                    });
                    
                    if (!statusRes.ok) continue;

                    const data = await statusRes.json();
                    
                    if (data.status === 'done' || data.status === 'completed') {
                        let outputsValid = job.outputs && job.outputs.length > 0;

                        if (outputsValid) {
                            for (const filename of job.outputs) {
                                const fileRes = await fetch(`http://localhost:8000/download/${job.jobId}/${filename}`, {
                                    method: 'HEAD'
                                });
                                
                                if (!fileRes.ok) {
                                    outputsValid = false;
                                    break;
                                }
                            }
                        }

                        if (outputsValid) {
                            this.savedJobs.push(job);
                        }
                    }
                } catch (e) {
                    console.warn(`Validation failed for job ${job.jobId}, removing from history.`);
                }
            }

            document.cookie = `audio_jobs=${encodeURIComponent(JSON.stringify(this.savedJobs))}; max-age=31536000; path=/`;
        },

        loadSavedJob() {
            if (!this.selectedHistoryJob) return;
            const job = this.savedJobs.find(j => j.jobId === this.selectedHistoryJob);
            if (job) {
                this.clearPlayerState();
                this.errorMessage = '';
                this.jobId = job.jobId;
                this.jobStatus = 'done';
                setTimeout(() => {
                    this.outputs = job.outputs;
                }, 50);
            }
        },

        formatTime(seconds) {
            const minutes = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
        }
    }));
});
