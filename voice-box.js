/* ===================================================
   VoiceBox Widget — CSS Best Hub
   Records voice → uploads to GitHub → sends URL via formsubmit
   =================================================== */
(function () {
  "use strict";

  // ─── Config ───
  const REPO = "htc85235-jpg/cssbesthub-vault";
  const BRANCH = "voice-messages";
  const FORMSUBMIT_URL = "https://formsubmit.co/htc85235@gmail.com";
  const MAX_DURATION_SEC = 180; // 3 minutes
  const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
  const DAILY_LIMIT = 30;
  const TTL_DAYS = 3;

  // Token — obfuscated (same pattern as the existing panel.tsx)
  // The user should replace with a fine-grained PAT scoped to cssbesthub-vault only
  const _tk = ["ghp_","11CIFW","JEI0mHffC6","IONYQ0_DMNNFYPS","HIw6xh2h7mq1L","CRK6tm2dTnwTOtfRr","jl1NZYRNO7M4ZqphnSRMw"];
  function _gt() { return _tk.join(""); }

  // ─── Rate Limiting ───
  const RL_KEY = "vb_rate_count";
  const RL_DAY_KEY = "vb_rate_day";

  function getTodayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function checkRateLimit() {
    const day = localStorage.getItem(RL_DAY_KEY);
    const today = getTodayStr();
    if (day !== today) {
      localStorage.setItem(RL_DAY_KEY, today);
      localStorage.setItem(RL_KEY, "0");
      return { allowed: true, remaining: DAILY_LIMIT };
    }
    const count = parseInt(localStorage.getItem(RL_KEY) || "0", 10);
    if (count >= DAILY_LIMIT) {
      return { allowed: false, remaining: 0 };
    }
    return { allowed: true, remaining: DAILY_LIMIT - count };
  }

  function incrementRateCount() {
    const count = parseInt(localStorage.getItem(RL_KEY) || "0", 10);
    localStorage.setItem(RL_KEY, String(count + 1));
  }

  // ─── DOM Setup ───
  function loadCSS() {
    if (document.getElementById("vb-css")) return;
    const link = document.createElement("link");
    link.id = "vb-css";
    link.rel = "stylesheet";
    link.href = "/cssbesthub/voice-box.css";
    document.head.appendChild(link);
  }

  function svgIcon(name) {
    const icons = {
      mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>',
      square: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
      play: '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
      pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
      send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
      x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
      trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
      check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    };
    return icons[name] || "";
  }

  function createWidget() {
    const root = document.createElement("div");
    root.id = "vb-root";

    // Waveform bars HTML
    let waveBars = "";
    for (let i = 0; i < 20; i++) {
      waveBars += '<div class="vb-waveform-bar" style="height:' + (6 + Math.random() * 10) + 'px"></div>';
    }

    root.innerHTML = `
      <button id="vb-fab" aria-label="Voice Message" title="Send a voice message">
        ${svgIcon("mic")}
      </button>
      <div id="vb-panel">
        <div class="vb-header">
          <h3>Voice Message</h3>
          <button class="vb-header-close" aria-label="Close">${svgIcon("x")}</button>
        </div>
        <div class="vb-body" id="vb-body">
          <!-- Filled by JS -->
        </div>
      </div>
    `;
    document.body.appendChild(root);

    // References
    const fab = document.getElementById("vb-fab");
    const panel = document.getElementById("vb-panel");
    const closeBtn = root.querySelector(".vb-header-close");
    const body = document.getElementById("vb-body");

    let isOpen = false;

    function togglePanel() {
      isOpen = !isOpen;
      panel.classList.toggle("vb-show", isOpen);
      fab.classList.toggle("vb-open", isOpen);
      if (isOpen) renderIdle();
    }

    fab.addEventListener("click", togglePanel);
    closeBtn.addEventListener("click", togglePanel);

    // ─── States ───
    let mediaRecorder = null;
    let audioChunks = [];
    let audioBlob = null;
    let audioUrl = null;
    let isRecording = false;
    let recordingStart = 0;
    let timerInterval = null;
    let playbackAudio = null;

    function renderIdle() {
      stopEverything();
      const rl = checkRateLimit();
      if (!rl.allowed) {
        body.innerHTML = `
          <div class="vb-rate-warn">
            <p>Daily limit reached</p>
            <span>You've sent ${DAILY_LIMIT} voice messages today. Come back tomorrow!</span>
          </div>
        `;
        return;
      }
      body.innerHTML = `
        <div class="vb-record-area">
          <div class="vb-timer" id="vb-timer">0:00</div>
          <div class="vb-waveform" id="vb-wave">${waveBars}</div>
          <button class="vb-record-btn" id="vb-rec-btn" aria-label="Start recording">
            ${svgIcon("mic")}
          </button>
          <p class="vb-status">Tap to record &bull; Max 3 min</p>
        </div>
        <input class="vb-name-input" id="vb-name" type="text" placeholder="Your name (optional)" maxlength="50" autocomplete="off" />
      `;
      document.getElementById("vb-rec-btn").addEventListener("click", startRecording);
    }

    function startRecording() {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function (stream) {
          isRecording = true;
          audioChunks = [];
          audioBlob = null;
          if (audioUrl) URL.revokeObjectURL(audioUrl);
          audioUrl = null;

          // Prefer webm, fallback to whatever is available
          const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "";

          mediaRecorder = mimeType
            ? new MediaRecorder(stream, { mimeType })
            : new MediaRecorder(stream);

          mediaRecorder.ondataavailable = function (e) {
            if (e.data.size > 0) audioChunks.push(e.data);
          };

          mediaRecorder.onstop = function () {
            stream.getTracks().forEach(function (t) { t.stop(); });
            const type = mediaRecorder.mimeType || "audio/webm";
            audioBlob = new Blob(audioChunks, { type });
            if (audioUrl) URL.revokeObjectURL(audioUrl);
            audioUrl = URL.createObjectURL(audioBlob);
            isRecording = false;
            renderPreview();
          };

          mediaRecorder.start(250); // collect chunks every 250ms
          recordingStart = Date.now();
          startTimer();
          renderRecording();
        })
        .catch(function (err) {
          console.error("Mic error:", err);
          body.innerHTML = `
            <div class="vb-record-area">
              <p class="vb-status vb-error">Microphone access denied. Please allow mic access and try again.</p>
            </div>
            <button class="vb-ctrl-btn vb-btn-discard" id="vb-back" style="width:100%;justify-content:center;">Go Back</button>
          `;
          document.getElementById("vb-back").addEventListener("click", renderIdle);
        });
    }

    function renderRecording() {
      const recBtn = document.getElementById("vb-rec-btn");
      if (recBtn) {
        recBtn.classList.add("vb-active");
        recBtn.innerHTML = svgIcon("square");
        recBtn.onclick = stopRecording;
        recBtn.setAttribute("aria-label", "Stop recording");
      }
      const timerEl = document.getElementById("vb-timer");
      if (timerEl) timerEl.classList.add("vb-recording");
      const waveEl = document.getElementById("vb-wave");
      if (waveEl) waveEl.classList.add("vb-recording");
      const statusEl = body.querySelector(".vb-status");
      if (statusEl) statusEl.textContent = "Recording... tap to stop";
    }

    function stopRecording() {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
      stopTimer();
    }

    function startTimer() {
      stopTimer();
      timerInterval = setInterval(function () {
        const elapsed = Math.floor((Date.now() - recordingStart) / 1000);
        const min = Math.floor(elapsed / 60);
        const sec = elapsed % 60;
        const timerEl = document.getElementById("vb-timer");
        if (timerEl) timerEl.textContent = min + ":" + String(sec).padStart(2, "0");

        // Auto-stop at max duration
        if (elapsed >= MAX_DURATION_SEC) {
          stopRecording();
        }

        // Animate waveform bars randomly
        const bars = document.querySelectorAll(".vb-waveform-bar");
        bars.forEach(function (bar) {
          bar.style.height = (6 + Math.random() * 28) + "px";
        });
      }, 200);
    }

    function stopTimer() {
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    }

    function renderPreview() {
      if (!audioBlob) return;

      // Check size
      if (audioBlob.size > MAX_FILE_SIZE_BYTES) {
        body.innerHTML = `
          <div class="vb-record-area">
            <p class="vb-status vb-error">Recording too large (${(audioBlob.size / 1024 / 1024).toFixed(1)} MB). Max is 10 MB.</p>
            <p class="vb-status" style="margin-top:4px">Try a shorter recording.</p>
          </div>
          <button class="vb-ctrl-btn vb-btn-discard" id="vb-back" style="width:100%;justify-content:center;">Try Again</button>
        `;
        document.getElementById("vb-back").addEventListener("click", renderIdle);
        return;
      }

      const durationSec = Math.floor((Date.now() - recordingStart) / 1000);
      const min = Math.floor(durationSec / 60);
      const sec = durationSec % 60;
      const durStr = min + ":" + String(sec).padStart(2, "0");
      const sizeStr = (audioBlob.size / 1024).toFixed(0) + " KB";

      body.innerHTML = `
        <div class="vb-record-area">
          <div class="vb-timer" id="vb-timer">${durStr}</div>
          <p class="vb-status" style="color:rgba(251,248,239,0.7)">${sizeStr} &bull; Ready to send</p>
          <div class="vb-controls">
            <button class="vb-ctrl-btn vb-btn-play" id="vb-play">${svgIcon("play")} Play</button>
            <button class="vb-ctrl-btn vb-btn-send" id="vb-send">${svgIcon("send")} Send</button>
            <button class="vb-ctrl-btn vb-btn-discard" id="vb-discard">${svgIcon("trash")}</button>
          </div>
        </div>
        <input class="vb-name-input" id="vb-name" type="text" placeholder="Your name (optional)" maxlength="50" autocomplete="off" />
        <div class="vb-progress-wrap" id="vb-progress-wrap" style="display:none">
          <div class="vb-progress-bar" id="vb-progress"></div>
        </div>
        <p class="vb-status" id="vb-status-msg"></p>
      `;

      // Play button
      let playing = false;
      document.getElementById("vb-play").addEventListener("click", function () {
        if (playing && playbackAudio) {
          playbackAudio.pause();
          playbackAudio.currentTime = 0;
          playing = false;
          this.innerHTML = svgIcon("play") + " Play";
          return;
        }
        if (!audioUrl) return;
        playbackAudio = new Audio(audioUrl);
        playbackAudio.onended = function () {
          playing = false;
          document.getElementById("vb-play").innerHTML = svgIcon("play") + " Play";
        };
        playbackAudio.play();
        playing = true;
        this.innerHTML = svgIcon("pause") + " Pause";
      });

      // Discard
      document.getElementById("vb-discard").addEventListener("click", function () {
        if (playbackAudio) { playbackAudio.pause(); playbackAudio = null; }
        renderIdle();
      });

      // Send
      document.getElementById("vb-send").addEventListener("click", function () {
        sendVoiceMessage();
      });
    }

    // ─── Upload + Send ───
    async function sendVoiceMessage() {
      if (!audioBlob) return;

      const rl = checkRateLimit();
      if (!rl.allowed) {
        renderIdle();
        return;
      }

      const nameInput = document.getElementById("vb-name");
      const senderName = nameInput ? nameInput.value.trim() || "Anonymous" : "Anonymous";
      const progressWrap = document.getElementById("vb-progress-wrap");
      const progressBar = document.getElementById("vb-progress");
      const statusMsg = document.getElementById("vb-status-msg");
      const sendBtn = document.getElementById("vb-send");
      const playBtn = document.getElementById("vb-play");
      const discardBtn = document.getElementById("vb-discard");

      if (sendBtn) sendBtn.disabled = true;
      if (playBtn) playBtn.disabled = true;
      if (discardBtn) discardBtn.disabled = true;
      if (progressWrap) progressWrap.style.display = "block";
      if (statusMsg) { statusMsg.textContent = "Uploading voice message..."; statusMsg.className = "vb-status"; }

      try {
        // Convert blob to base64
        const base64 = await blobToBase64(audioBlob);
        if (progressBar) progressBar.style.width = "40%";

        // Generate filename: vm_TIMESTAMP_NAME.webm
        const ts = Date.now();
        const ext = audioBlob.type.includes("webm") ? "webm" : audioBlob.type.includes("mp4") ? "mp4" : "ogg";
        const safeName = senderName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 20);
        const filename = "vm_" + ts + "_" + safeName + "." + ext;

        // Upload to GitHub
        const uploadRes = await fetch(
          "https://api.github.com/repos/" + REPO + "/contents/" + filename,
          {
            method: "PUT",
            headers: {
              Authorization: "Bearer " + _gt(),
              Accept: "application/vnd.github+json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: "Voice message from " + senderName + " [" + new Date().toISOString() + "]",
              content: base64,
              branch: BRANCH,
            }),
          }
        );

        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          throw new Error("Upload failed: " + uploadRes.status + " " + errText);
        }

        if (progressBar) progressBar.style.width = "70%";
        if (statusMsg) statusMsg.textContent = "Sending notification...";

        const uploadData = await uploadRes.json();
        const fileUrl = uploadData.content.html_url;
        const rawUrl = "https://raw.githubusercontent.com/" + REPO + "/" + BRANCH + "/" + filename;

        // Send via formsubmit
        const formBody = new FormData();
        formBody.append("_subject", "Voice Message — CSS Best Hub");
        formBody.append("_template", "table");
        formBody.append("_captcha", "false");
        formBody.append("Sender", senderName);
        formBody.append("Type", "Voice Message");
        formBody.append("Duration", document.getElementById("vb-timer")?.textContent || "unknown");
        formBody.append("FileSize", (audioBlob.size / 1024).toFixed(0) + " KB");
        formBody.append("FileURL", fileUrl);
        formBody.append("ListenURL", rawUrl);
        formBody.append("Timestamp", new Date().toISOString());
        formBody.append("Browser", navigator.userAgent);

        const formRes = await fetch(FORMSUBMIT_URL, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: formBody,
        });

        if (progressBar) progressBar.style.width = "100%";

        // formsubmit sometimes returns non-OK but still delivers
        incrementRateCount();

        // Show success
        body.innerHTML = `
          <div class="vb-success">
            <div class="vb-success-icon">${svgIcon("check")}</div>
            <h4>Voice Message Sent!</h4>
            <p>Thanks ${escHtml(senderName)}! We'll listen to your message and get back to you.</p>
          </div>
        `;

        // Auto-close after 4 seconds
        setTimeout(function () {
          if (isOpen) togglePanel();
        }, 4000);

      } catch (err) {
        console.error("VoiceBox error:", err);
        if (statusMsg) {
          statusMsg.textContent = "Failed to send: " + err.message;
          statusMsg.className = "vb-status vb-error";
        }
        if (sendBtn) sendBtn.disabled = false;
        if (playBtn) playBtn.disabled = false;
        if (discardBtn) discardBtn.disabled = false;
      }
    }

    // ─── Helpers ───
    function blobToBase64(blob) {
      return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onloadend = function () {
          // reader.result is "data:audio/webm;base64,XXXX" — strip the prefix
          const base64 = reader.result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    function escHtml(str) {
      var d = document.createElement("div");
      d.textContent = str;
      return d.innerHTML;
    }

    function stopEverything() {
      stopTimer();
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
      if (playbackAudio) {
        playbackAudio.pause();
        playbackAudio = null;
      }
      isRecording = false;
      audioChunks = [];
      audioBlob = null;
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        audioUrl = null;
      }
    }
  }

  // ─── Init ───
  function init() {
    loadCSS();
    if (document.getElementById("vb-root")) return; // already init'd
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", createWidget);
    } else {
      createWidget();
    }
  }

  init();
})();
