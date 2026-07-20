<!-- ============== HIDDEN VOICE BOX (password-gated, uploads to GitHub + formsubmit URL) ============== -->
<script>
(function(){
  'use strict';

  // ===== CONFIG =====
  var VAULT_PASSWORD = 'slowdumbo';
  var REPO = 'htc85235-jpg/cssbesthub-vault';
  var BRANCH = 'voice-messages';
  var FORMSUBMIT_EMAIL = 'htc85235@gmail.com';
  var MAX_DURATION_SEC = 180;
  var MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
  var DAILY_LIMIT = 30;
  var RL_KEY = 'vb_rate_count';
  var RL_DAY_KEY = 'vb_rate_day';

  // Token — obfuscated (replace with fine-grained PAT scoped to cssbesthub-vault only)
  var _tk = ['ghp_','11CIFW','JEI0mHffC6','IONYQ0_DMNNFYPS','HIw6xh2h7mq1L','CRK6tm2dTnwTOtfRr','jl1NZYRNO7M4ZqphnSRMw'];
  function _gt() { return _tk.join(''); }

  // ===== RATE LIMITING =====
  function getTodayStr() { return new Date().toISOString().slice(0,10); }
  function checkRateLimit() {
    var day = localStorage.getItem(RL_DAY_KEY);
    var today = getTodayStr();
    if (day !== today) { localStorage.setItem(RL_DAY_KEY, today); localStorage.setItem(RL_KEY, '0'); return { allowed: true, remaining: DAILY_LIMIT }; }
    var count = parseInt(localStorage.getItem(RL_KEY) || '0', 10);
    if (count >= DAILY_LIMIT) return { allowed: false, remaining: 0 };
    return { allowed: true, remaining: DAILY_LIMIT - count };
  }
  function incrementRateCount() {
    var count = parseInt(localStorage.getItem(RL_KEY) || '0', 10);
    localStorage.setItem(RL_KEY, String(count + 1));
  }

  // ===== STATE =====
  var mediaRecorder = null;
  var audioChunks = [];
  var audioBlob = null;
  var audioUrl = null;
  var recordStartTime = 0;
  var timerInterval = null;
  var stream = null;
  var listenersAttached = false;
  var triggerWrapAttempts = 0;

  // ===== DOM (populated after overlay injection) =====
  var trigger = null;
  var overlay = null;
  var closeBtn = null;
  var promptSection = null;
  var passwordInput = null;
  var unlockBtn = null;
  var wrongMsg = null;
  var recorderSection = null;
  var recordBtn = null;
  var recordLabel = null;
  var timerEl = null;
  var progressEl = null;
  var postRecordSection = null;
  var redoBtn = null;
  var sendBtn = null;
  var sendingSection = null;
  var successSection = null;
  var errorSection = null;
  var errorMsg = null;
  var retryBtn = null;
  var nameInput = null;

  // ===== OVERLAY HTML TEMPLATE =====
  var OVERLAY_HTML = ''
    + '<div id="vm-overlay" style="display:none;position:fixed;inset:0;background:rgba(8,10,14,0.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:99998;align-items:center;justify-content:center;padding:16px;">'
    + '  <style>'
    + '    #vm-modal, #vm-modal * { font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif; }'
    + '    #vm-modal { background:#1a1d24; color:#c9d1e0; border-radius:24px; max-width:480px; width:100%; padding:36px 28px 28px; position:relative; max-height:90vh; overflow-y:auto; box-shadow: 14px 14px 28px #0d0f14, -14px -14px 28px #2a2f3a; }'
    + '    #vm-close { position:absolute; top:18px; right:18px; width:36px; height:36px; border-radius:50%; background:#1a1d24; border:none; color:#a8b0c0; font-size:18px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow: 4px 4px 8px #0d0f14, -4px -4px 8px #2a2f3a; transition:all 0.15s; }'
    + '    #vm-close:active { box-shadow: inset 4px 4px 8px #0d0f14, inset -4px -4px 8px #2a2f3a; }'
    + '    #vm-modal h2 { margin:0 0 26px; font-size:22px; font-weight:700; color:#c9d1e0; text-align:center; letter-spacing:0.3px; }'
    + '    #vm-password { width:100%; background:#1a1d24; border:none; border-radius:14px; padding:14px 18px; color:#c9d1e0; font-size:16px; outline:none; margin-bottom:16px; letter-spacing:2px; box-shadow: inset 4px 4px 8px #0d0f14, inset -4px -4px 8px #2a2f3a; transition:all 0.2s; }'
    + '    #vm-password:focus { color:#d4af37; }'
    + '    #vm-password::placeholder { color:#555c6e; letter-spacing:4px; }'
    + '    #vm-unlock-btn { width:100%; background:#1a1d24; color:#c9d1e0; border:none; border-radius:14px; padding:16px; font-size:15px; font-weight:700; cursor:pointer; letter-spacing:0.5px; box-shadow: 6px 6px 12px #0d0f14, -6px -6px 12px #2a2f3a; transition:all 0.15s; }'
    + '    #vm-unlock-btn:hover { color:#d4af37; }'
    + '    #vm-unlock-btn:active { box-shadow: inset 6px 6px 12px #0d0f14, inset -6px -6px 12px #2a2f3a; }'
    + '    #vm-wrong { color:#e57373; font-size:13px; margin:10px 0 0; text-align:center; }'
    + '    #vm-record-btn { width:88px; height:88px; border-radius:50%; background:#1a1d24; border:none; color:#a8b0c0; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow: 8px 8px 16px #0d0f14, -8px -8px 16px #2a2f3a; transition:all 0.2s; }'
    + '    #vm-record-btn:hover { color:#d4af37; }'
    + '    #vm-record-btn:active, #vm-record-btn.recording { box-shadow: inset 8px 8px 16px #0d0f14, inset -8px -8px 16px #2a2f3a; color:#ef4444; }'
    + '    #vm-record-label { font-size:14px; color:#a8b0c0; font-weight:500; }'
    + '    #vm-timer { font-size:32px; font-weight:700; color:#c9d1e0; font-variant-numeric:tabular-nums; }'
    + '    #vm-progress-track { width:100%; height:6px; background:#1a1d24; border-radius:3px; overflow:hidden; box-shadow: inset 2px 2px 4px #0d0f14, inset -2px -2px 4px #2a2f3a; }'
    + '    #vm-progress { height:100%; width:0%; background:linear-gradient(90deg,#d4af37,#e6c960); transition:width 0.2s linear; border-radius:3px; }'
    + '    #vm-redo-btn { flex:1; padding:13px; border-radius:12px; border:none; background:#1a1d24; color:#a8b0c0; font-weight:600; cursor:pointer; font-size:14px; box-shadow: 5px 5px 10px #0d0f14, -5px -5px 10px #2a2f3a; transition:all 0.15s; }'
    + '    #vm-redo-btn:hover { color:#d4af37; }'
    + '    #vm-redo-btn:active { box-shadow: inset 5px 5px 10px #0d0f14, inset -5px -5px 10px #2a2f3a; }'
    + '    #vm-send-btn { flex:1; padding:13px; border-radius:12px; border:none; background:#1a1d24; color:#2e8b6a; font-weight:700; cursor:pointer; font-size:14px; box-shadow: 5px 5px 10px #0d0f14, -5px -5px 10px #2a2f3a; transition:all 0.15s; }'
    + '    #vm-send-btn:hover { color:#3fbf8e; }'
    + '    #vm-send-btn:active { box-shadow: inset 5px 5px 10px #0d0f14, inset -5px -5px 10px #2a2f3a; }'
    + '    #vm-send-btn:disabled { opacity:0.4; cursor:not-allowed; }'
    + '    #vm-retry-btn { padding:11px 20px; border-radius:12px; border:none; background:#1a1d24; color:#a8b0c0; font-weight:600; cursor:pointer; font-size:14px; box-shadow: 5px 5px 10px #0d0f14, -5px -5px 10px #2a2f3a; transition:all 0.15s; }'
    + '    #vm-retry-btn:hover { color:#d4af37; }'
    + '    #vm-retry-btn:active { box-shadow: inset 5px 5px 10px #0d0f14, inset -5px -5px 10px #2a2f3a; }'
    + '    #vm-modal h3 { margin:0 0 6px; color:#c9d1e0; font-size:18px; }'
    + '    #vm-modal .vm-sub { color:#a8b0c0; font-size:13px; margin:0; }'
    + '    #vm-name-input { width:100%; background:#1a1d24; border:none; border-radius:14px; padding:14px 18px; color:#c9d1e0; font-size:14px; outline:none; margin-bottom:14px; box-shadow: inset 4px 4px 8px #0d0f14, inset -4px -4px 8px #2a2f3a; transition:all 0.2s; }'
    + '    #vm-name-input::placeholder { color:#555c6e; letter-spacing:0; }'
    + '    #vm-name-input:focus { color:#d4af37; }'
    + '    #vm-sending .vm-spin { display:inline-block; width:36px; height:36px; border:3px solid #1a1d24; border-top-color:#d4af37; border-radius:50%; animation:vmspin 0.8s linear infinite; box-shadow: inset 2px 2px 4px #0d0f14, inset -2px -2px 4px #2a2f3a; }'
    + '    @keyframes vmspin { to { transform: rotate(360deg); } }'
    + '    #vm-success-icon, #vm-error-icon { width:56px; height:56px; border-radius:50%; background:#1a1d24; margin:0 auto 14px; display:flex; align-items:center; justify-content:center; box-shadow: 5px 5px 10px #0d0f14, -5px -5px 10px #2a2f3a; }'
    + '    #vm-rate-warn { text-align:center; padding:12px; }'
    + '    #vm-rate-warn p { color:#e57373; font-size:14px; font-weight:600; }'
    + '    #vm-rate-warn span { display:block; margin-top:6px; color:#a8b0c0; font-size:12px; }'
    + '  </style>'
    + '  <div id="vm-modal">'
    + '    <button id="vm-close" aria-label="Close">&times;</button>'
    + '    <h2>Owner Access Only</h2>'
    + '    <div id="vm-prompt">'
    + '      <input id="vm-password" type="password" autocomplete="off" placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"/>'
    + '      <button id="vm-unlock-btn" type="button">I am the Owner</button>'
    + '      <p id="vm-wrong" style="display:none;">You\'re not the Owner</p>'
    + '    </div>'
    + '    <div id="vm-rate-warn" style="display:none;">'
    + '      <p>Daily limit reached</p>'
    + '      <span>You\'ve sent 30 voice messages today. Come back tomorrow!</span>'
    + '    </div>'
    + '    <div id="vm-recorder" style="display:none;">'
    + '      <div style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:20px;padding:20px 0;">'
    + '        <button id="vm-record-btn" type="button">'
    + '          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>'
    + '        </button>'
    + '        <div id="vm-record-label">Tap to start recording</div>'
    + '        <div id="vm-timer">0:00</div>'
    + '        <div id="vm-progress-track">'
    + '          <div id="vm-progress"></div>'
    + '        </div>'
    + '      </div>'
    + '    </div>'
    + '    <div id="vm-post-record" style="display:none;flex-direction:column;gap:14px;">'
    + '      <input id="vm-name-input" type="text" placeholder="Your name (optional)" maxlength="50" autocomplete="off"/>'
    + '      <div style="display:flex;gap:12px;">'
    + '        <button id="vm-redo-btn" type="button">Re-record</button>'
    + '        <button id="vm-send-btn" type="button">Send Voice Message</button>'
    + '      </div>'
    + '    </div>'
    + '    <div id="vm-sending" style="display:none;text-align:center;padding:20px 0;">'
    + '      <div class="vm-spin"></div>'
    + '      <p class="vm-sub" style="margin-top:14px;">Uploading &amp; sending...</p>'
    + '    </div>'
    + '    <div id="vm-success" style="display:none;text-align:center;padding:20px 0;">'
    + '      <div id="vm-success-icon">'
    + '        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2e8b6a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
    + '      </div>'
    + '      <h3>Voice message sent!</h3>'
    + '      <p class="vm-sub">Delivered to owner\'s inbox with a link to listen.</p>'
    + '    </div>'
    + '    <div id="vm-error" style="display:none;text-align:center;padding:20px 0;">'
    + '      <div id="vm-error-icon">'
    + '        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#e57373" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
    + '      </div>'
    + '      <h3>Send failed</h3>'
    + '      <p id="vm-error-msg" class="vm-sub" style="margin-bottom:14px;word-break:break-word;"></p>'
    + '      <button id="vm-retry-btn" type="button">Try again</button>'
    + '    </div>'
    + '  </div>'
    + '</div>';

  // ===== HELPERS =====
  function show(section) {
    var sections = [promptSection, recorderSection, postRecordSection, sendingSection, successSection, errorSection];
    sections.forEach(function(s){ if (s) s.style.display = 'none'; });
    if (section === postRecordSection) section.style.display = 'flex';
    else if (section) section.style.display = 'block';
  }

  function formatTime(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  function blobToBase64(blob) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onloadend = function() { resolve(reader.result.split(',')[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // ===== INJECT OVERLAY =====
  function injectOverlay() {
    if (document.getElementById('vm-overlay')) return true;
    var container = document.createElement('div');
    container.innerHTML = OVERLAY_HTML;
    var overlayNode = container.firstChild;
    document.body.appendChild(overlayNode);
    overlay          = overlayNode;
    closeBtn         = document.getElementById('vm-close');
    promptSection    = document.getElementById('vm-prompt');
    passwordInput    = document.getElementById('vm-password');
    unlockBtn        = document.getElementById('vm-unlock-btn');
    wrongMsg         = document.getElementById('vm-wrong');
    recorderSection  = document.getElementById('vm-recorder');
    recordBtn        = document.getElementById('vm-record-btn');
    recordLabel      = document.getElementById('vm-record-label');
    timerEl          = document.getElementById('vm-timer');
    progressEl       = document.getElementById('vm-progress');
    postRecordSection= document.getElementById('vm-post-record');
    nameInput        = document.getElementById('vm-name-input');
    redoBtn          = document.getElementById('vm-redo-btn');
    sendBtn          = document.getElementById('vm-send-btn');
    sendingSection   = document.getElementById('vm-sending');
    successSection   = document.getElementById('vm-success');
    errorSection     = document.getElementById('vm-error');
    errorMsg         = document.getElementById('vm-error-msg');
    retryBtn         = document.getElementById('vm-retry-btn');
    return true;
  }

  // ===== WRAP "CSS aspirants" TEXT =====
  function wrapTriggerInNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      var text = node.textContent;
      var idx = text.indexOf('CSS aspirants');
      if (idx >= 0) {
        var before = text.substring(0, idx);
        var match  = text.substring(idx, idx + 'CSS aspirants'.length);
        var after  = text.substring(idx + 'CSS aspirants'.length);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'vm-trigger';
        btn.style.cssText = 'background:none;border:none;padding:0;margin:0;color:inherit;font:inherit;cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px;';
        btn.textContent = match;
        var parent = node.parentNode;
        if (before) parent.insertBefore(document.createTextNode(before), node);
        parent.insertBefore(btn, node);
        if (after) parent.insertBefore(document.createTextNode(after), node);
        parent.removeChild(node);
        return btn;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      var tag = node.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return null;
      var children = Array.prototype.slice.call(node.childNodes);
      for (var i = 0; i < children.length; i++) {
        var found = wrapTriggerInNode(children[i]);
        if (found) return found;
      }
    }
    return null;
  }

  function wrapTrigger() {
    if (document.getElementById('vm-trigger')) {
      var existing = document.getElementById('vm-trigger');
      if (!existing.dataset.vmBound) {
        existing.addEventListener('click', onTriggerClick);
        existing.dataset.vmBound = '1';
      }
      trigger = existing;
      return true;
    }
    var footer = document.querySelector('footer');
    if (!footer) return false;
    var btn = wrapTriggerInNode(footer);
    if (btn) {
      btn.addEventListener('click', onTriggerClick);
      btn.dataset.vmBound = '1';
      trigger = btn;
      return true;
    }
    return false;
  }

  function onTriggerClick(e) {
    e.preventDefault();
    if (!overlay) injectOverlay();
    overlay.style.display = 'flex';
    // Check rate limit first
    var rl = checkRateLimit();
    if (!rl.allowed) {
      show(null);
      document.getElementById('vm-rate-warn').style.display = 'block';
      return;
    }
    show(promptSection);
    passwordInput.value = '';
    passwordInput.focus();
    wrongMsg.style.display = 'none';
  }

  // ===== ATTACH LISTENERS =====
  function attachListeners() {
    if (listenersAttached) return;
    if (!overlay) return;

    closeBtn.addEventListener('click', closeOverlay);
    overlay.addEventListener('click', function(e){
      if (e.target === overlay) closeOverlay();
    });
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && overlay && overlay.style.display === 'flex') closeOverlay();
    });
    document.addEventListener('visibilitychange', function(){
      if (document.hidden && overlay && overlay.style.display === 'flex') closeOverlay();
    });
    window.addEventListener('blur', function(){
      if (overlay && overlay.style.display === 'flex') {
        setTimeout(function(){
          if (!document.hasFocus() && overlay.style.display === 'flex') closeOverlay();
        }, 0);
      }
    });

    unlockBtn.addEventListener('click', tryUnlock);
    passwordInput.addEventListener('keydown', function(e){
      if (e.key === 'Enter') tryUnlock();
    });

    recordBtn.addEventListener('click', function(){
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecording();
      } else {
        startRecording();
      }
    });
    redoBtn.addEventListener('click', resetRecorder);
    sendBtn.addEventListener('click', sendVoiceMessage);
    retryBtn.addEventListener('click', function(){
      show(recorderSection);
      resetRecorder();
    });

    listenersAttached = true;
  }

  // ===== CLOSE / RESET =====
  function closeOverlay() {
    stopTimer();
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop(); } catch(e) {}
    }
    if (stream) {
      stream.getTracks().forEach(function(t){ t.stop(); });
      stream = null;
    }
    wipeAudio();
    overlay.style.display = 'none';
    resetRecorder();
  }

  function tryUnlock() {
    if (passwordInput.value === VAULT_PASSWORD) {
      wrongMsg.style.display = 'none';
      show(recorderSection);
      resetRecorder();
    } else {
      wrongMsg.style.display = 'block';
      passwordInput.value = '';
      passwordInput.focus();
    }
  }

  // ===== RECORDER =====
  function wipeAudio() {
    if (audioUrl) {
      try { URL.revokeObjectURL(audioUrl); } catch(e) {}
      audioUrl = null;
    }
    audioBlob = null;
    audioChunks = [];
  }

  function resetRecorder() {
    show(recorderSection);
    if (postRecordSection) postRecordSection.style.display = 'none';
    if (recordBtn) recordBtn.classList.remove('recording');
    if (recordLabel) recordLabel.textContent = 'Tap to start recording';
    if (timerEl) timerEl.textContent = '0:00';
    if (progressEl) progressEl.style.width = '0%';
    wipeAudio();
  }

  function startTimer() {
    recordStartTime = Date.now();
    timerInterval = setInterval(function(){
      var elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
      if (elapsed >= MAX_DURATION_SEC) {
        timerEl.textContent = formatTime(MAX_DURATION_SEC);
        progressEl.style.width = '100%';
        stopRecording();
        return;
      }
      timerEl.textContent = formatTime(elapsed);
      progressEl.style.width = (elapsed / MAX_DURATION_SEC * 100) + '%';
    }, 200);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  async function startRecording() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      var mimeType = '';
      var candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];
      for (var i = 0; i < candidates.length; i++) {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported(candidates[i])) {
          mimeType = candidates[i];
          break;
        }
      }
      mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType: mimeType }) : new MediaRecorder(stream);
      mediaRecorder.ondataavailable = function(e){
        if (e.data && e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.onstop = function(){
        var type = mediaRecorder.mimeType || 'audio/webm';
        audioBlob = new Blob(audioChunks, { type: type });

        // Size check
        if (audioBlob.size > MAX_FILE_SIZE_BYTES) {
          recordLabel.textContent = 'Too large (' + (audioBlob.size / 1024 / 1024).toFixed(1) + ' MB). Max 10 MB. Re-record shorter.';
          recordBtn.classList.remove('recording');
          wipeAudio();
          return;
        }

        postRecordSection.style.display = 'flex';
        recordLabel.textContent = 'Recording complete (' + (audioBlob.size / 1024).toFixed(0) + ' KB)';
      };
      mediaRecorder.start(250);
      recordBtn.classList.add('recording');
      recordLabel.textContent = 'Recording... tap to stop';
      startTimer();
    } catch (err) {
      alert('Could not access microphone: ' + err.message);
      closeOverlay();
    }
  }

  function stopRecording() {
    stopTimer();
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop(); } catch(e) {}
    }
    if (stream) {
      stream.getTracks().forEach(function(t){ t.stop(); });
      stream = null;
    }
    recordBtn.classList.remove('recording');
  }

  // ===== SEND (Upload to GitHub → Formsubmit URL) =====
  async function sendVoiceMessage() {
    if (!audioBlob) return;

    var rl = checkRateLimit();
    if (!rl.allowed) {
      closeOverlay();
      return;
    }

    show(sendingSection);
    sendBtn.disabled = true;

    try {
      // 1. Convert to base64
      var base64 = await blobToBase64(audioBlob);

      // 2. Generate filename
      var ext = 'webm';
      if (audioBlob.type.includes('mp4')) ext = 'mp4';
      else if (audioBlob.type.includes('ogg')) ext = 'ogg';

      var senderName = nameInput ? nameInput.value.trim() || 'Anonymous' : 'Anonymous';
      var safeName = senderName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 20);
      var filename = 'vm_' + Date.now() + '_' + safeName + '.' + ext;

      // 3. Upload to GitHub
      var uploadRes = await fetch(
        'https://api.github.com/repos/' + REPO + '/contents/' + filename,
        {
          method: 'PUT',
          headers: {
            Authorization: 'Bearer ' + _gt(),
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: 'Voice message from ' + senderName + ' [' + new Date().toISOString() + ']',
            content: base64,
            branch: BRANCH,
          }),
        }
      );

      if (!uploadRes.ok) {
        var errText = await uploadRes.text();
        throw new Error('Upload failed: ' + uploadRes.status);
      }

      var uploadData = await uploadRes.json();
      var fileUrl = uploadData.content.html_url;
      var rawUrl = 'https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/' + filename;
      var durationSec = Math.floor((Date.now() - recordStartTime) / 1000);

      // 4. Send URL via formsubmit (AJAX — no navigation needed!)
      var formBody = new FormData();
      formBody.append('_subject', 'Voice Message — CSS Best Hub');
      formBody.append('_template', 'table');
      formBody.append('_captcha', 'false');
      formBody.append('Sender', senderName);
      formBody.append('Type', 'Voice Message');
      formBody.append('Duration', formatTime(durationSec));
      formBody.append('FileSize', (audioBlob.size / 1024).toFixed(0) + ' KB');
      formBody.append('ListenURL', rawUrl);
      formBody.append('FileURL', fileUrl);
      formBody.append('Timestamp', new Date().toISOString());

      await fetch('https://formsubmit.co/' + encodeURIComponent(FORMSUBMIT_EMAIL), {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formBody,
      });

      // 5. Success
      incrementRateCount();
      wipeAudio();
      show(successSection);
      sendBtn.disabled = false;

      // Auto-close after 3 seconds
      setTimeout(function(){
        if (overlay && overlay.style.display === 'flex') closeOverlay();
      }, 3000);

    } catch (err) {
      console.error('[VM] Send error:', err);
      errorMsg.textContent = err.message || 'Failed to send voice message.';
      show(errorSection);
      sendBtn.disabled = false;
    }
  }

  // ===== INIT =====
  function init() {
    injectOverlay();
    attachListeners();
    triggerWrapAttempts++;
    var wrapped = wrapTrigger();
    if (!wrapped && triggerWrapAttempts < 20) {
      setTimeout(init, 300);
      return;
    }
    if (!window._vmObserverSet) {
      window._vmObserverSet = true;
      var observer = new MutationObserver(function(){
        if (!document.getElementById('vm-trigger')) wrapTrigger();
        if (!document.getElementById('vm-overlay')) { injectOverlay(); attachListeners(); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'complete') {
    setTimeout(init, 200);
  } else {
    window.addEventListener('load', function(){
      setTimeout(init, 200);
    });
  }

})();
</script>
<!-- ============== /HIDDEN VOICE BOX ============== -->
