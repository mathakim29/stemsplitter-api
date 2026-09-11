<h1>
    <img src="https://watermelon.crd.co/assets/images/gallery05/1aee39ec.gif?v=14238bdb" width=30px>
    Stemsplitter API
</h1>

A RESTful API for audio stem separation using the <code><a href="https://github.com/nomadkaraoke/python-audio-separator">audio-separator</a></code> library, inspired by the Stem Player by Kano Computing.


## Features

* Choose from multiple separation architectures (VR, MDX, Demucs, MDXC) loaded on-the-fly.
* Working demo under /demo/index.html


## Quick Start
> NOTE: Ensure `nvidia-container-toolkit` is installed if running with GPU support.

1. Clone this repo
2. Run `make build` followed by `make run`
3. Run `make stop` to stop the container

> NOTE: See .env file for default settings, by default is 8000
3. The API runs on localhost:8000
3. Go to <a href="http://localhost:8000/demo/index.html">http://localhost:8000/demo/index.html</a> for demo app

> [!WARNING]
> Sometimes, the server to download the models/checkpoint will encounter downtime, and the API will fail.

## API Reference

<p><strong>Base URL:</strong> <code>/</code> | <strong>Version:</strong> <code>0.1.0</code></p>

<h3>Endpoints</h3>

<!-- Endpoint 1 -->
<details open>
  <summary><strong><code>POST</code> /separate</strong> - Separate Audio (URL or File)</summary>
  <p>Accepts either an audio URL or a file upload along with a model name to process stem separation.</p>

  <h4>Request Body (<code>multipart/form-data</code>)</h4>
  <table>
    <thead>
      <tr>
        <th>Field</th>
        <th>Type</th>
        <th>Required</th>
        <th>Default</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>url</code></td>
        <td><code>string</code></td>
        <td>No</td>
        <td>—</td>
        <td>Audio source URL (mutually exclusive with file).</td>
      </tr>
      <tr>
        <td><code>file</code></td>
        <td><code>file</code> (binary)</td>
        <td>No</td>
        <td>—</td>
        <td>Audio file stream to upload (mutually exclusive with url).</td>
      </tr>
      <tr>
        <td><code>model_name</code></td>
        <td><code>string</code></td>
        <td>No</td>
        <td><code>"UVR-MDX-NET-Inst_HQ_3.onnx"</code></td>
        <td>Model configuration filename.</td>
      </tr>
    </tbody>
  </table>

  <h4>Responses</h4>
  <ul>
    <li><code>200 OK</code> — Processing job created successfully.</li>
    <li><code>422 Unprocessable Entity</code> — Invalid parameters or inputs.</li>
  </ul>
</details>

<br>

<!-- Endpoint 2 -->
<details open>
  <summary><strong><code>GET</code> /status/{job_id}</strong> - Get Job Status</summary>
  <p>Retrieves the status, progress, and resulting outputs for a specific processing job.</p>

  <h4>Path Parameters</h4>
  <table>
    <thead>
      <tr>
        <th>Parameter</th>
        <th>Type</th>
        <th>Required</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>job_id</code></td>
        <td><code>string</code></td>
        <td><strong>Yes</strong></td>
        <td>Unique job identifier.</td>
      </tr>
    </tbody>
  </table>

  <h4>Responses</h4>
  <ul>
    <li><code>200 OK</code> — Returns current job status, progress, and outputs array.</li>
    <li><code>422 Unprocessable Entity</code> — Invalid <code>job_id</code> path parameter.</li>
  </ul>
</details>

<br>

<!-- Endpoint 3 -->
<details open>
  <summary><strong><code>GET</code> /download/{job_id}/{filename}</strong> - Download Separated Stem</summary>
  <p>Downloads a specific separated stem track file associated with a job.</p>

  <h4>Path Parameters</h4>
  <table>
    <thead>
      <tr>
        <th>Parameter</th>
        <th>Type</th>
        <th>Required</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>job_id</code></td>
        <td><code>string</code></td>
        <td><strong>Yes</strong></td>
        <td>Unique job identifier.</td>
      </tr>
      <tr>
        <td><code>filename</code></td>
        <td><code>string</code></td>
        <td><strong>Yes</strong></td>
        <td>Target filename of the stem track.</td>
      </tr>
    </tbody>
  </table>

  <h4>Responses</h4>
  <ul>
    <li><code>200 OK</code> — File stream payload.</li>
    <li><code>422 Unprocessable Entity</code> — Invalid path parameters.</li>
  </ul>
</details>

<br>

<!-- Endpoint 4 -->
<details open>
  <summary><strong><code>GET</code> /models</strong> - List Available Models</summary>
  <p>Retrieves a dictionary of available audio separation models grouped by category.</p>

  <h4>Responses</h4>
  <ul>
    <li><code>200 OK</code> — Returns available model groupings.</li>
  </ul>
</details>