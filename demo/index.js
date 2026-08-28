import WaveSurfer from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js";
import HoverPlugin from "https://unpkg.com/wavesurfer.js@7/dist/plugins/hover.esm.js";
import $ from "https://esm.sh/cash-dom";
import axios from "https://esm.sh/axios";

// import localforage from "https://cdn.jsdelivr.net/npm/localforage@1.10.0/+esm";

const api = axios.create({ timeout: 10000 }); // 10s timeout fixes hangs

let wavesurferInstances = [];
let pollTimer = null;
let abortCtrl = null;   // cancels stale requests
let isSubmitting = false;

const setCookie = (name, value, days = 7) => {
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${new Date(Date.now() + days * 864e5).toUTCString()};path=/;SameSite=Lax`;
};
const getCookie = (name) => document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1] ? decodeURIComponent(RegExp.$1) : null;
const deleteCookie = (name) => (document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`);

window.addEventListener("beforeunload", (e) => {
  if (isSubmitting) e.preventDefault();
});

// heartbeat
setInterval(async () => {
  try {
    await api.get("/ping");
    if (!pollTimer) $("#result-container").text("Server is currently active");
  } catch {
    $("#result-container").text("Server disconnected");
  }
}, 2500);

const formatTime = (s) => {
  const pad = (n) => Math.floor(n).toString().padStart(2, "0");
  return `${pad(s / 60)}:${pad(s % 60)}.${pad((s % 1) * 100)}`;
};

const errMsg = (err) => err.response?.data?.error || err.response?.data?.["stack-trace"] || err.message;

async function loadModels() {
  const sel = document.getElementById("model-select");
  try {
    const { data } = await api.get("/api/list-models");

    Object.values(data?.output || {})
      .flatMap((group) => Object.entries(group))
      .filter(([name]) => !name.includes("VIP"))
      .forEach(([name, m]) => {
        // new Option(text, value)
        sel.appendChild(new Option(name, name));

        // Note: Use new Option(name, m.filename) if your backend still requires the filename as the selected value.
      });
  } catch (err) {
    console.error("Failed to fetch models:", errMsg(err));
    sel.innerHTML = '<option value="">Failed to load models</option>';
  }
}
loadModels();

function cleanupTracks() {
  wavesurferInstances.forEach((ws) => ws.destroy());
  wavesurferInstances = [];
  $("#waveform-container").empty();
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
  abortCtrl?.abort();
  abortCtrl = null;
}

function buildTracks(files, originalName, videoTitle = null) {
  cleanupTracks();
  if (!files.length) return;

  $("#waveform-container").append(`
    <div class="controls-bar">
      <button id="play-all-btn">Play All</button>
      <button id="stop-all-btn">Stop All</button>
    </div>
  `);

  files.forEach((file, i) => {
    // Extract stem name from filename (removes UUID prefix)
    const stem = file.replace(/^[0-9a-f-]{36}_?/, "");
    // Use video title if available, otherwise use original filename
    let displayName = stem;
    if (videoTitle) {
      // Remove file extension from video title if present
      const cleanTitle = videoTitle.replace(/\.[^/.]+$/, "");
    } else if (originalName) {
      const cleanName = originalName.replace(/\.[^/.]+$/, "");
    }
    displayName = `${stem}`;

    $("#waveform-container").append(`
      <div class="stem-player">
        <span id="time-${i}" class="time-display">00:00.00</span>
        <h4 title="${displayName}">${displayName.length > 50 ? displayName.substring(0, 47) + '...' : displayName}</h4>
        <div id="waveform-${i}"></div>
        <button id="btn-${i}">Play / Pause</button>
        <a href='/api/exports/${file}' download>Download</a>
      </div>
    `);

    const ws = WaveSurfer.create({
      container: `#waveform-${i}`,
      waveColor: "#4F4A85",
      progressColor: "#383351",
      url: `/api/exports/${file}`,
      plugins: [HoverPlugin.create({ lineColor: "#ff0000", lineWidth: 2, labelBackground: "#555", labelColor: "#fff", labelSize: "11px" })],
    });

    ws.on("timeupdate", (t) => $(`#time-${i}`).text(formatTime(t)));
    ws.on("error", (err) => console.error(`WaveSurfer error on ${file}:`, err));
    $(`#btn-${i}`).on("click", () => ws.playPause());
    wavesurferInstances.push(ws);
  });

  $("#play-all-btn").on("click", () => {
    const allPlaying = wavesurferInstances.every((ws) => ws.isPlaying());
    wavesurferInstances.forEach((ws) => (allPlaying ? ws.pause() : ws.play()));
    $("#play-all-btn").text(allPlaying ? "Play All" : "Pause All");
  });

  $("#stop-all-btn").on("click", () => {
    wavesurferInstances.forEach((ws) => { ws.pause(); ws.seekTo(0); });
    $("#play-all-btn").text("Play All");
  });
}

async function handleFinished(data) {
  stopPolling();
  $("#result-container").text("Done! (Job completed)");
  const files = data?.result?.output_files || [];
  const originalName = data?.result.original_filename || null;
  const videoTitle = data?.result.video_title || null;


  // Display video info if available
  if (videoTitle) {
    $("#result-container").html(`Done! (Job completed)<br><strong>Video:</strong> ${videoTitle}`);
  }

  $("#track-title").text(videoTitle);
  $("#track-sub").text(data?.result.file_id);

  buildTracks(files, originalName, videoTitle);
  isSubmitting = false;
}

function pollJobStatus(jobId) {
  stopPolling();
  abortCtrl = new AbortController();
  const { signal } = abortCtrl;

  pollTimer = setInterval(async () => {
    try {
      const [statusRes, logRes] = await Promise.all([
        api.get(`/api/status/${jobId}`, { signal }),
        api.get(`/api/log-pipe?job_id=${jobId}`, { signal }), // scoped to job now
      ]);

      const progress = statusRes.data?.progress;
      const logLines = logRes.data?.lines || [];

      // Show latest log lines
      const logDisplay = logLines.slice(-3).join("\n"); // Show last 3 lines
      const videoTitle = statusRes.data?.video_title || '';

      let statusText = logDisplay || "Processing...";
      if (videoTitle) {
        statusText = `🎵 ${videoTitle}\n${statusText}`;
      }
      $("#result-container").text(statusText);

      if (progress === "finished") {
        await handleFinished(statusRes.data);
      } else if (progress === "failed" || progress === "error") {
        stopPolling();
        $("#result-container").text(`Job failed: ${statusRes.data?.error || "unknown error"}`);
        isSubmitting = false;
      }
    } catch (err) {
      if (axios.isCancel(err)) return; // ignore aborted/stale requests
      stopPolling();
      console.error("Polling request failed:", err);
      $("#result-container").text(`Polling error: ${errMsg(err)}`);
      isSubmitting = false;
    }
  }, 2000);
}

async function restoreJobFromCookie() {
  const jobId = getCookie("jobId");
  if (!jobId) return;

  try {
    const { data } = await api.get(`/api/status/${jobId}`);
    if (data?.progress === "finished") {
      $("#result-container").text(`Resuming completed job ${jobId}`);
      await handleFinished(data);
    } else if (data?.progress === "failed" || data?.progress === "error") {
      $("#result-container").text(`Job failed: ${data?.error || "unknown error"}`);
    } else {
      const videoTitle = data?.video_title || '';
      const statusText = videoTitle ? `🎵 ${videoTitle}\nResuming monitoring...` : `Resuming monitoring of job ${jobId}...`;
      $("#result-container").text(statusText);
      pollJobStatus(jobId);
    }
  } catch (err) {
    console.error("Failed to restore job:", err);
    $("#result-container").text(`Failed to restore job: ${errMsg(err)}`);
  }
}
document.addEventListener("DOMContentLoaded", restoreJobFromCookie);

// Add visual feedback for URL input
$("#yt-dlp-url").on("input", function () {
  const url = $(this).val().trim();
  const fileInput = document.getElementById("file-input");

  if (url) {
    // Show loading indicator for URL
    $(".url-status").remove();
    // $(this).after('<span class="url-status" style="margin-left: 10px; color: #666;">🔗 YouTube URL detected</span>');

    // Optionally fetch video title preview
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      fetchVideoPreview(url);
    }
  } else {
    $(".url-status").remove();
  }
});

async function fetchVideoPreview(url) {
  try {
    const { data } = await api.post("/api/preview", { url });
    if (data?.title) {
      $(".url-status").text(`🎵 ${data.title}`);
    }
  } catch (err) {
    // Silently fail - just use URL
  }
}


// submit function 
$("#app-form").on("submit", async function (e) {
  e.preventDefault();
  isSubmitting = true;

  const fileInput = document.getElementById("file-input");
  const fileSelected = fileInput?.files.length > 0;
  const urlValue = $("#yt-dlp-url").val()?.trim();

  if (!fileSelected && !urlValue) {
    $("#result-container").text("Please provide either a local audio file or a video URL.");
    isSubmitting = false;
    return;
  }

  stopPolling();
  deleteCookie("jobId");
  cleanupTracks();

  const formData = new FormData();
  const model = $("#model-select").val();
  if (!model) {
    $("#result-container").text("Please select a model.");
    isSubmitting = false;
    return;
  }
  formData.append("model", model);

  if (urlValue) {
    formData.append("url", urlValue);
    $("#result-container").text("🎵 Fetching best audio from YouTube...");
  } else {
    formData.append("file", fileInput.files[0]);
    $("#result-container").text("📁 Uploading audio file...");
  }

  try {
    const { data } = await api.post("/api/upload/", formData, {
      timeout: 60000, // longer timeout for uploads
      onUploadProgress: (progressEvent) => {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        if (urlValue) {
          $("#result-container").text(`🎵 Downloading audio... ${percent}%`);
        } else {
          $("#result-container").text(`📁 Uploading... ${percent}%`);
        }
      }
    });

    if (data?.status === "error") {
      $("#result-container").text(`Error: ${data["stack-trace"] || "Submission error"}`);
      isSubmitting = false;
      return;
    }

    const jobId = data?.id;
    const videoTitle = data?.video_title || null;
    // const file_id = data?.result.file_id || null;


    setCookie("jobId", jobId, 7);


    const statusText = videoTitle
      ? `🎵 ${videoTitle}\nQueued... Job ID: ${jobId}`
      : `Queued... Job ID: ${jobId}`;
    $("#result-container").text(statusText);
    pollJobStatus(jobId);
  } catch (err) {
    console.error("Upload request failed:", err);
    $("#result-container").text(`Error submitting data: ${errMsg(err)}`);
    isSubmitting = false;
  }
});