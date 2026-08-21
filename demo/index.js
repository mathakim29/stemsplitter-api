import WaveSurfer from "https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js";
import HoverPlugin from "https://unpkg.com/wavesurfer.js@7/dist/plugins/hover.esm.js";
import $ from "https://esm.sh/cash-dom";
import localforage from "https://cdn.jsdelivr.net/npm/localforage@1.10.0/+esm";
import axios from "https://esm.sh/axios";

let wavesurferInstances = [];
let currentPollId = null;

const formatTime = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 100);
  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${millis.toString().padStart(2, "0")}`;
};

async function loadModels() {
  const selectEl = document.getElementById("model-select");
  try {
    const response = await axios.get("/api/list-models");
    const models = response.data.output;

    Object.keys(models).forEach((arch) => {
      const categoryGroup = models[arch];
      Object.keys(categoryGroup).forEach((modelKey) => {
        const filename = categoryGroup[modelKey].filename;
        if (filename) {
          const option = document.createElement("option");
          option.value = filename;
          option.textContent = filename;
          selectEl.appendChild(option);
        }
      });
    });
  } catch (err) {
    console.error("Failed to fetch models:", err.response || err.message || err);
    selectEl.innerHTML = '<option value="">Failed to load models</option>';
  }
}

loadModels();

function cleanupTracks() {
  wavesurferInstances.forEach((ws) => ws.destroy());
  wavesurferInstances = [];
  $("#waveform-container").empty();
}

function stopPolling() {
  if (currentPollId !== null) {
    clearInterval(currentPollId);
    currentPollId = null;
  }
}

function buildTracks(files) {
  cleanupTracks();

  if (files.length > 0) {
    $("#waveform-container").append(`
      <div class="controls-bar">
        <button id="play-all-btn">Play All</button>
        <button id="stop-all-btn">Stop All</button>
      </div>
    `);
  }

  files.forEach((file, index) => {
    const trackId = `waveform-${index}`;
    const timeId = `time-${index}`;
    const displayName = file.replace(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_?/,
      "",
    );

    $("#waveform-container").append(`
      <div class="stem-player">
        <span id="${timeId}" class="time-display">00:00.00</span>
        <h4>${displayName}</h4>
        <div id="${trackId}"></div>
        <button id="btn-${index}">Play / Pause</button>
        <a href='/api/exports/${file}'>Download</a>
      </div>
    `);

    const ws = WaveSurfer.create({
      container: `#${trackId}`,
      waveColor: "#4F4A85",
      progressColor: "#383351",
      url: `/api/exports/${file}`,
      plugins: [
        HoverPlugin.create({
          lineColor: "#ff0000",
          lineWidth: 2,
          labelBackground: "#555",
          labelColor: "#fff",
          labelSize: "11px",
        }),
      ],
    });

    ws.on("timeupdate", (currentTime) => {
      $(`#${timeId}`).text(formatTime(currentTime));
    });

    ws.on("error", (err) => {
      console.error(`WaveSurfer error on ${file}:`, err);
    });

    $(`#btn-${index}`).on("click", () => ws.playPause());
    wavesurferInstances.push(ws);
  });

  // Play/Pause All: toggles based on whether ALL are playing
  $("#play-all-btn").on("click", () => {
    const allPlaying =
      wavesurferInstances.length > 0 &&
      wavesurferInstances.every((ws) => ws.isPlaying());

    wavesurferInstances.forEach((ws) => {
      allPlaying ? ws.pause() : ws.play();
    });
    $("#play-all-btn").text(allPlaying ? "Play All" : "Pause All");
  });

  // Stop All: pause + reset playhead to 0
  $("#stop-all-btn").on("click", () => {
    wavesurferInstances.forEach((ws) => {
      ws.pause();
      ws.seekTo(0);
    });
    $("#play-all-btn").text("Play All");
  });
}

$("#app-form").on("submit", async function (e) {
  e.preventDefault();

  const fileInput = document.getElementById("file-input");
  if (!fileInput.files.length) {
    $("#result-container").text("Please choose a file first.");
    return;
  }

  stopPolling();

  const formData = new FormData();
  formData.append("file", fileInput.files[0]);
  formData.append("model", $("#model-select").val());

  $("#result-container").text("Uploading...");

  try {
    const response = await axios.post("/api/upload/", formData);
    const data = response.data;
    
    $("#result-container").text(`Processing...`);
    await localforage.setItem("file-id", data.id);

    currentPollId = setInterval(async () => {
      try {
        const r = await axios.get(`/api/status/${data.id}`);
        const d = r.data;

        const get_log = await axios.get(`/api/log-pipe`);
        const log_data = get_log.data;

        $("#result-container").text(log_data.lines.join("\n"));

        if (d.progress === "finished") {
          stopPolling();
          $("#result-container").text("Done!");

          const files = d.result?.output_files || [];
          await localforage.setItem("output-files", files);
          buildTracks(files);
        } else if (d.progress === "error") {
          stopPolling();
          console.error("Job status returned an error state:", d);
          $("#result-container").text(
            `Job failed: ${d.error || "unknown error"}`,
          );
        }
        // else: still processing, keep polling
      } catch (pollErr) {
        stopPolling();
        console.error("Polling request failed:", pollErr.response || pollErr.message || pollErr);
        $("#result-container").text(`Polling error: ${pollErr.message}`);
      }
    }, 2000);
  } catch (error) {
    console.error("Upload request failed:", error.response || error.message || error);
    $("#result-container").text(`Error loading data: ${error.message}`);
  }
});