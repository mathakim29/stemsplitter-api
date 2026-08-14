<h1>
    <img src="https://watermelon.crd.co/assets/images/gallery05/1aee39ec.gif?v=14238bdb" width=30px>
    Stemsplitter API
</h1>

A RESTful API for audio stem separation using the <code><a href="https://github.com/nomadkaraoke/python-audio-separator">audio-separator</a></code> library, inspired by the Stem Player by Kano Computing.


## Features

* Choose from multiple separation architectures (VR, MDX, Demucs, MDXC) loaded on-the-fly.
* Working demo under /demo/site.html


## Quick Start
> NOTE: Ensure `nvidia-container-toolkit` is installed if running with GPU support.

1. Clone this repo
2. Run `docker compose up --build`

> NOTE: See .env file for default settings, by default is 8000
3. The API runs on localhost:8000/api
3. Go to <a href="http://localhost:8000/demo/site.html">http://localhost:8000/demo/site.html</a> for demo app

## API Reference

<p><strong>Base URL:</strong> <code>/api</code> | <strong>Version:</strong> <code>0.1.0</code></p>

<hr>

<h2>Endpoints</h2>

<!-- Endpoint 1 -->
<details open>
  <summary><strong><code>POST</code> /upload/</strong> - Upload Audio File</summary>
  <p>Uploads an audio file along with an optional model selection for stem separation.</p>

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
        <td><code>file</code></td>
        <td><code>string</code> (binary)</td>
        <td><strong>Yes</strong></td>
        <td>—</td>
        <td>Audio file stream to upload.</td>
      </tr>
      <tr>
        <td><code>model</code></td>
        <td><code>string</code></td>
        <td>No</td>
        <td><code>"htdemucs.yaml"</code></td>
        <td>Model configuration filename.</td>
      </tr>
    </tbody>
  </table>

  <h4>Responses</h4>
  <ul>
    <li><code>200 OK</code> — File uploaded and processing job created.</li>
    <li><code>422 Unprocessable Entity</code> — Missing file or invalid form parameters.</li>
  </ul>
</details>

<br>

<!-- Endpoint 2 -->
<details open>
  <summary><strong><code>GET</code> /status/{job_id}</strong> - Get Job Status</summary>
  <p>Retrieves the status and metadata for a specific processing job.</p>

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
    <li><code>200 OK</code> — Returns current job status and progress details.</li>
    <li><code>422 Unprocessable Entity</code> — Invalid <code>job_id</code> path parameter.</li>
  </ul>
</details>

<br>

<!-- Endpoint 3 -->
<details open>
  <summary><strong><code>GET</code> /exports/{filename}</strong> - Download Export File</summary>
  <p>Downloads an exported file or separated stem track by name.</p>

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
        <td><code>filename</code></td>
        <td><code>string</code></td>
        <td><strong>Yes</strong></td>
        <td>Target filename inside the export directory.</td>
      </tr>
    </tbody>
  </table>

  <h4>Responses</h4>
  <ul>
    <li><code>200 OK</code> — File stream payload.</li>
    <li><code>422 Unprocessable Entity</code> — Invalid target filename.</li>
  </ul>
</details>

<br>

<!-- Endpoint 4 -->
<details open>
  <summary><strong><code>GET</code> /list-models</strong> - List Available Models</summary>
  <p>Retrieves a list of available audio separation models.</p>

  <h4>Responses</h4>
  <ul>
    <li><code>200 OK</code> — Returns array of available model configurations.</li>
  </ul>
</details>


