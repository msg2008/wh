/* ═══════════════════════════════════════════════════════════
   WHATSAPP CLONE — CALL SYSTEM JS
   Full WebRTC voice + video, drag PiP, all controls
   ═══════════════════════════════════════════════════════════ */

// ── State ───────────────────────────────────────────────────
const CallState = {
  currentCall: null,    // { call_id, type:'voice'|'video', peerId, peerName, peerAvatar }
  peerConn: null,
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isSpeakerOn: true,
  isVideoOn: true,
  isSharingScreen: false,
  callSeconds: 0,
  callTimerInterval: null,
  isIncoming: false,
  facingMode: 'user',   // front/back camera
};

// ── SVG Icons ────────────────────────────────────────────────
const Icons = {
  phone:     `<svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.67-.36 1-.24 1.1.4 2.3.6 3.6.6.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02L6.6 10.8z"/></svg>`,
  phoneOff:  `<svg viewBox="0 0 24 24"><path d="M23.76 14.37l-4.46-1.2a1 1 0 0 0-.97.26l-2.2 2.2a15.045 15.045 0 0 1-6.59-6.59l2.2-2.2c.27-.27.35-.65.26-.98L10.8.27C10.67-.15 10.28-.4 9.86-.4H1C.44-.4 0 .04 0 .6 0 13.44 10.56 24 23.4 24c.56 0 1-.44 1-1V15.22c.01-.41-.24-.8-.64-.85zM4 2.01h4.01l.96 3.59-2.2 2.2c1.07 2.04 2.38 3.74 4.04 5.38 1.66 1.66 3.36 2.97 5.38 4.04l2.2-2.2 3.59.96v3.99C9.66 19.9 4.1 14.34 4 2.01zm17.68 8.79l1.41-1.41-4.59-4.59L20 3.4V0h-4l1.79 1.79-1.41 1.41L21.68 10.8z"/></svg>`,
  video:     `<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`,
  videoOff:  `<svg viewBox="0 0 24 24"><path d="M21 6.5l-4-4-9.71 9.71 3.5 3.5L21 6.5zm-17.31.31L2.31 8.19 6 11.88V15c0 .55.45 1 1 1h7.12l2 2H6c-1.66 0-3-1.34-3-3V7.62l.69.69zM21 17.5L4.27 .77 3 2.04l18.42 18.42L23 18.96l-2-1.46z"/></svg>`,
  mic:       `<svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`,
  micOff:    `<svg viewBox="0 0 24 24"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>`,
  speaker:   `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`,
  speakerOff:`<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`,
  screen:    `<svg viewBox="0 0 24 24"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>`,
  flip:      `<svg viewBox="0 0 24 24"><path d="M9 16h6v6l-3-3-3 3v-6zm6-8H9V2L6 5 3 2v6h6l-3 3-3-3H2l5-5 5 5h1V8zm4 8l-3-3-3 3h6v-6l-3 3-3-3v6z"/></svg>`,
  flipCam:   `<svg viewBox="0 0 24 24"><path d="M20 5h-3.17L15 3H9L7.17 5H4C2.9 5 2 5.9 2 7v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-10 9V9l-4 5h12l-4-5v5h-4z"/></svg>`,
  expand:    `<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`,
  end:       `<svg viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08C.11 12.9 0 12.65 0 12.37c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.66c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>`,
  msgBtn:    `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>`,
};

// ── Build HTML ────────────────────────────────────────────────
function buildCallUI() {
  // Remove old overlays if present
  document.getElementById('incoming-call')?.remove();
  document.getElementById('active-call')?.remove();

  document.body.insertAdjacentHTML('beforeend', `
  <!-- ═══ INCOMING CALL OVERLAY ═══ -->
  <div id="incoming-call" class="hidden">
    <div class="call-backdrop"></div>
    <div class="call-orb call-orb-1"></div>
    <div class="call-orb call-orb-2"></div>
    <div class="incoming-call-card">
      <div class="ic-type-badge" id="ic-type-badge">
        ${Icons.phone} Voice Call
      </div>
      <div class="ic-avatar-wrap">
        <div class="ic-ripple"></div>
        <div class="ic-ripple"></div>
        <div class="ic-ripple"></div>
        <img class="ic-avatar" id="ic-avatar" src="" alt="" onerror="this.src='/static/img/default-avatar.png'">
      </div>
      <div class="ic-name" id="ic-name">Caller Name</div>
      <div class="ic-status" id="ic-status">Incoming voice call…</div>
      <div class="ic-actions">
        <button class="ic-btn decline" onclick="CallUI.decline()">
          <div class="ic-btn-circle">${Icons.end}</div>
          <span class="ic-btn-label">Decline</span>
        </button>
        <button class="ic-btn msg-btn" onclick="CallUI.sendBusyMsg()">
          <div class="ic-btn-circle">${Icons.msgBtn}</div>
          <span class="ic-btn-label">Message</span>
        </button>
        <button class="ic-btn accept" id="ic-accept-btn" onclick="CallUI.accept()">
          <div class="ic-btn-circle">${Icons.phone}</div>
          <span class="ic-btn-label">Accept</span>
        </button>
      </div>
    </div>
  </div>

  <!-- ═══ ACTIVE CALL SCREEN ═══ -->
  <div id="active-call" class="hidden">

    <!-- VOICE CALL VIEW -->
    <div id="voice-call-view" class="hidden">
      <div class="voice-call-bg">
        <div class="voice-call-mesh"></div>
        <!-- Waveform bars -->
        <div class="voice-waveform-anim" id="vc-waveform"></div>
      </div>
      <div class="voice-call-content">
        <div class="vc-avatar-ring">
          <div class="vc-ring"></div>
          <div class="vc-ring"></div>
          <div class="vc-ring"></div>
          <img class="vc-avatar" id="vc-avatar" src="" alt="" onerror="this.src='/static/img/default-avatar.png'">
        </div>
        <div class="vc-name" id="vc-name"></div>
        <div class="vc-phone" id="vc-phone"></div>
        <div class="calling-state" id="vc-calling-state">
          <div class="vc-status">Calling…</div>
          <div class="calling-dots">
            <div class="calling-dot"></div>
            <div class="calling-dot"></div>
            <div class="calling-dot"></div>
          </div>
        </div>
        <div class="vc-timer hidden" id="vc-timer">0:00</div>

        <!-- Controls -->
        <div class="vc-controls">
          <button class="vc-ctrl-btn" id="vc-mute-btn" onclick="CallUI.toggleMute()">
            <div class="vc-ctrl-icon">${Icons.mic}</div>
            <span class="vc-ctrl-label">Mute</span>
          </button>
          <button class="vc-ctrl-btn" id="vc-speaker-btn" onclick="CallUI.toggleSpeaker()">
            <div class="vc-ctrl-icon">${Icons.speaker}</div>
            <span class="vc-ctrl-label">Speaker</span>
          </button>
          <button class="vc-ctrl-btn" onclick="CallUI.switchToVideo()">
            <div class="vc-ctrl-icon">${Icons.video}</div>
            <span class="vc-ctrl-label">Video</span>
          </button>
          <button class="vc-ctrl-btn" onclick="CallUI.openKeypad()">
            <div class="vc-ctrl-icon">
              <svg viewBox="0 0 24 24" width="22" height="22" style="fill:var(--call-white)"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>
            </div>
            <span class="vc-ctrl-label">Keypad</span>
          </button>
        </div>

        <!-- End call -->
        <button class="vc-end-btn" onclick="CallUI.endCall()" title="End call">
          ${Icons.end}
        </button>
      </div>
    </div>

    <!-- VIDEO CALL VIEW -->
    <div id="video-call-view" class="hidden">
      <div class="video-call-layout">

        <!-- Remote stream / placeholder -->
        <div class="remote-video-placeholder" id="remote-placeholder">
          <img id="remote-placeholder-img" src="" alt="" onerror="this.src='/static/img/default-avatar.png'">
          <div class="rvp-name" id="remote-placeholder-name"></div>
          <div class="calling-state" id="vid-calling-state" style="margin-top:8px">
            <div style="font-size:14px;color:rgba(255,255,255,.5)">Connecting…</div>
            <div class="calling-dots" style="justify-content:center">
              <div class="calling-dot"></div>
              <div class="calling-dot"></div>
              <div class="calling-dot"></div>
            </div>
          </div>
        </div>
        <video id="remote-video" autoplay playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none"></video>

        <!-- PiP local video -->
        <video id="local-video" autoplay playsinline muted class="hidden"></video>
        <button class="pip-flip-btn hidden" id="pip-flip-btn" onclick="CallUI.flipCamera()">
          ${Icons.flipCam}
        </button>

        <!-- Screen share badge -->
        <div class="screen-share-badge hidden" id="screen-share-badge">
          <div class="screen-share-badge-dot"></div>
          Sharing screen
        </div>

        <!-- Top bar -->
        <div class="video-top-bar">
          <img class="vtb-avatar" id="vtb-avatar" src="" alt="" onerror="this.src='/static/img/default-avatar.png'">
          <div class="vtb-info">
            <div class="vtb-name" id="vtb-name"></div>
            <div id="vtb-status" style="font-size:13px;color:rgba(255,255,255,.5)">Calling…</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="call-quality" id="call-quality">
              <div class="cq-bar"></div>
              <div class="cq-bar"></div>
              <div class="cq-bar"></div>
              <div class="cq-bar"></div>
            </div>
            <div class="vtb-timer hidden" id="vtb-timer" style="font-size:13px;color:rgba(255,255,255,.8);font-family:var(--call-mono);letter-spacing:1px"></div>
          </div>
          <div class="vtb-actions">
            <button class="vtb-action-btn" onclick="CallUI.toggleExpand()" title="Expand">
              ${Icons.expand}
            </button>
          </div>
        </div>

        <!-- Bottom controls -->
        <div class="video-controls">
          <button class="vid-ctrl-btn normal" id="vid-mute-btn" onclick="CallUI.toggleMute()">
            <div class="vid-ctrl-icon">${Icons.mic}</div>
            <span class="vid-ctrl-label">Mute</span>
          </button>
          <button class="vid-ctrl-btn normal" id="vid-cam-btn" onclick="CallUI.toggleVideo()">
            <div class="vid-ctrl-icon">${Icons.video}</div>
            <span class="vid-ctrl-label">Camera</span>
          </button>
          <button class="vid-end-btn" onclick="CallUI.endCall()" title="End call">
            ${Icons.end}
          </button>
          <button class="vid-ctrl-btn normal" id="vid-screen-btn" onclick="CallUI.toggleScreenShare()">
            <div class="vid-ctrl-icon">${Icons.screen}</div>
            <span class="vid-ctrl-label">Share</span>
          </button>
          <button class="vid-ctrl-btn normal" id="vid-flip-btn" onclick="CallUI.flipCamera()">
            <div class="vid-ctrl-icon">${Icons.flipCam}</div>
            <span class="vid-ctrl-label">Flip</span>
          </button>
        </div>
      </div>
    </div>

  </div>
  `);

  buildWaveformBars();
  setupPiPDrag();
}

// Build animated waveform bars
function buildWaveformBars() {
  const wv = document.getElementById('vc-waveform');
  if (!wv) return;
  for (let i = 0; i < 60; i++) {
    const bar = document.createElement('div');
    bar.className = 'wv-bar';
    const h = 10 + Math.random() * 90;
    bar.style.height = h + 'px';
    bar.style.animationDelay = (Math.random() * 1.2) + 's';
    bar.style.animationDuration = (0.8 + Math.random() * 0.8) + 's';
    bar.style.opacity = 0.3 + Math.random() * 0.5;
    wv.appendChild(bar);
  }
}

// ── PiP drag ──────────────────────────────────────────────────
function setupPiPDrag() {
  const pip = document.getElementById('local-video');
  if (!pip) return;
  let dragging = false, ox = 0, oy = 0;

  pip.addEventListener('mousedown', e => {
    dragging = true; ox = e.clientX - pip.offsetLeft; oy = e.clientY - pip.offsetTop;
    pip.style.transition = 'none';
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    let x = e.clientX - ox, y = e.clientY - oy;
    x = Math.max(0, Math.min(window.innerWidth - pip.offsetWidth, x));
    y = Math.max(0, Math.min(window.innerHeight - pip.offsetHeight, y));
    pip.style.right = 'auto'; pip.style.top = y + 'px'; pip.style.left = x + 'px';
  });
  document.addEventListener('mouseup', () => {
    dragging = false;
    pip.style.transition = 'box-shadow 0.2s';
  });

  // Touch support
  pip.addEventListener('touchstart', e => {
    const t = e.touches[0]; dragging = true;
    ox = t.clientX - pip.offsetLeft; oy = t.clientY - pip.offsetTop;
    pip.style.transition = 'none';
  });
  document.addEventListener('touchmove', e => {
    if (!dragging) return;
    const t = e.touches[0];
    let x = t.clientX - ox, y = t.clientY - oy;
    x = Math.max(0, Math.min(window.innerWidth - pip.offsetWidth, x));
    y = Math.max(0, Math.min(window.innerHeight - pip.offsetHeight, y));
    pip.style.right = 'auto'; pip.style.top = y + 'px'; pip.style.left = x + 'px';
  });
  document.addEventListener('touchend', () => { dragging = false; });
}

// ── CallUI object ─────────────────────────────────────────────
const CallUI = {

  // ── Outgoing call ────────────────────────────────────────
  async startCall(peerId, peerName, peerAvatar, type = 'voice') {
    if (CallState.currentCall) { showToast('Already in a call'); return; }

    CallState.currentCall = { peerId, peerName, peerAvatar, type, call_id: null };
    CallState.isMuted = false;
    CallState.isVideoOn = true;
    CallState.isSharingScreen = false;

    this._showActiveCall(type, peerName, peerAvatar, false);

    // Emit via socket
    if (typeof socket !== 'undefined') {
      socket.emit('call_user', { receiver_id: peerId, type });
    }

    // Get media
    try {
      CallState.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video' ? { facingMode: CallState.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } } : false
      });
      if (type === 'video') this._attachLocalVideo();
      this._setupPeer(peerId);
      const offer = await CallState.peerConn.createOffer();
      await CallState.peerConn.setLocalDescription(offer);
      if (typeof socket !== 'undefined') {
        socket.emit('webrtc_offer', { to: peerId, from: window.me?.id, offer });
      }
    } catch (e) {
      console.warn('Media unavailable, continuing in audio-only mode', e);
    }
  },

  // ── Show incoming ────────────────────────────────────────
  showIncoming(data) {
    if (CallState.currentCall) {
      // Already in call — show mini toast
      this._showCallToast(data);
      return;
    }
    CallState.isIncoming = true;
    CallState.currentCall = {
      call_id: data.call_id,
      peerId: data.caller_id,
      peerName: data.caller_name,
      peerAvatar: data.caller_avatar,
      type: data.type
    };

    const isVideo = data.type === 'video';
    document.getElementById('ic-avatar').src = data.caller_avatar || '/static/img/default-avatar.png';
    document.getElementById('ic-name').textContent = data.caller_name;
    document.getElementById('ic-status').textContent = `Incoming ${data.type} call…`;
    document.getElementById('ic-type-badge').innerHTML =
      (isVideo ? Icons.video : Icons.phone) + ' ' + (isVideo ? 'Video Call' : 'Voice Call');

    // Update accept button icon for video
    document.getElementById('ic-accept-btn').querySelector('.ic-btn-circle').innerHTML =
      isVideo ? Icons.video : Icons.phone;

    document.getElementById('incoming-call').classList.remove('hidden');

    // Vibrate
    if (navigator.vibrate) navigator.vibrate([300, 200, 300]);
  },

  // ── Accept ───────────────────────────────────────────────
  async accept() {
    const call = CallState.currentCall; if (!call) return;
    document.getElementById('incoming-call').classList.add('hidden');

    this._showActiveCall(call.type, call.peerName, call.peerAvatar, false);
    socket?.emit('call_answer', { call_id: call.call_id });
    this.startCallTimer();

    try {
      CallState.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: call.type === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false
      });
      if (call.type === 'video') this._attachLocalVideo();
      this._setupPeer(call.peerId);
    } catch (e) {
      console.warn('Media unavailable', e);
    }
  },

  // ── Decline ──────────────────────────────────────────────
  decline() {
    socket?.emit('call_decline', { call_id: CallState.currentCall?.call_id });
    document.getElementById('incoming-call').classList.add('hidden');
    CallState.currentCall = null;
    CallState.isIncoming = false;
  },

  sendBusyMsg() {
    if (CallState.currentCall) {
      const msg = "Can't talk right now, I'll call back.";
      socket?.emit('send_message', {
        type: 'text', content: msg,
        receiver_id: CallState.currentCall.peerId,
        group_id: null
      });
    }
    this.decline();
    showToast('Message sent');
  },

  // ── End call ─────────────────────────────────────────────
  endCall() {
    socket?.emit('call_end', { call_id: CallState.currentCall?.call_id, duration: CallState.callSeconds });
    this._teardown();
    showToast(`Call ended · ${_fmtDuration(CallState.callSeconds)}`);
  },

  // ── Mute toggle ──────────────────────────────────────────
  toggleMute() {
    CallState.isMuted = !CallState.isMuted;
    if (CallState.localStream) {
      CallState.localStream.getAudioTracks().forEach(t => t.enabled = !CallState.isMuted);
    }
    const muted = CallState.isMuted;

    // Voice view
    const vcBtn = document.getElementById('vc-mute-btn');
    if (vcBtn) {
      vcBtn.querySelector('.vc-ctrl-icon').innerHTML = muted ? Icons.micOff : Icons.mic;
      vcBtn.querySelector('.vc-ctrl-label').textContent = muted ? 'Unmute' : 'Mute';
      vcBtn.classList.toggle('muted', muted);
    }
    // Video view
    const vidBtn = document.getElementById('vid-mute-btn');
    if (vidBtn) {
      vidBtn.querySelector('.vid-ctrl-icon').innerHTML = muted ? Icons.micOff : Icons.mic;
      vidBtn.querySelector('.vid-ctrl-label').textContent = muted ? 'Unmute' : 'Mute';
      vidBtn.classList.toggle('off', muted);
    }
    showToast(muted ? 'Microphone muted' : 'Microphone on');
  },

  // ── Speaker ──────────────────────────────────────────────
  toggleSpeaker() {
    CallState.isSpeakerOn = !CallState.isSpeakerOn;
    const on = CallState.isSpeakerOn;
    const btn = document.getElementById('vc-speaker-btn');
    if (btn) {
      btn.querySelector('.vc-ctrl-icon').innerHTML = on ? Icons.speaker : Icons.speakerOff;
      btn.querySelector('.vc-ctrl-label').textContent = on ? 'Speaker' : 'Earpiece';
      btn.classList.toggle('active', on);
    }
    showToast(on ? 'Speaker on' : 'Earpiece mode');
  },

  // ── Camera toggle ─────────────────────────────────────────
  toggleVideo() {
    CallState.isVideoOn = !CallState.isVideoOn;
    const on = CallState.isVideoOn;
    if (CallState.localStream) {
      CallState.localStream.getVideoTracks().forEach(t => t.enabled = on);
    }
    const pip = document.getElementById('local-video');
    if (pip) pip.style.opacity = on ? '1' : '0.4';

    const btn = document.getElementById('vid-cam-btn');
    if (btn) {
      btn.querySelector('.vid-ctrl-icon').innerHTML = on ? Icons.video : Icons.videoOff;
      btn.querySelector('.vid-ctrl-label').textContent = on ? 'Camera' : 'Start Cam';
      btn.classList.toggle('off', !on);
    }
    showToast(on ? 'Camera on' : 'Camera off');
  },

  // ── Switch voice → video ──────────────────────────────────
  async switchToVideo() {
    if (CallState.currentCall) CallState.currentCall.type = 'video';
    document.getElementById('voice-call-view').classList.add('hidden');
    document.getElementById('video-call-view').classList.remove('hidden');
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoStream.getVideoTracks().forEach(t => {
        CallState.localStream?.addTrack(t);
        CallState.peerConn?.addTrack(t, CallState.localStream);
      });
      if (!CallState.localStream) CallState.localStream = videoStream;
      this._attachLocalVideo();
    } catch (e) { showToast('Camera access denied'); }
  },

  // ── Screen share ─────────────────────────────────────────
  async toggleScreenShare() {
    if (CallState.isSharingScreen) {
      // Stop sharing
      CallState.isSharingScreen = false;
      document.getElementById('screen-share-badge').classList.add('hidden');
      const btn = document.getElementById('vid-screen-btn');
      if (btn) { btn.classList.remove('off'); btn.querySelector('.vid-ctrl-label').textContent = 'Share'; }
      // Revert to camera
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = camStream.getVideoTracks()[0];
        const sender = CallState.peerConn?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
        const pip = document.getElementById('local-video');
        if (pip) pip.srcObject = camStream;
      } catch (e) {}
      showToast('Screen sharing stopped');
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        CallState.isSharingScreen = true;
        document.getElementById('screen-share-badge').classList.remove('hidden');
        const btn = document.getElementById('vid-screen-btn');
        if (btn) { btn.classList.add('off'); btn.querySelector('.vid-ctrl-label').textContent = 'Stop Share'; }
        const screenTrack = screenStream.getVideoTracks()[0];
        const sender = CallState.peerConn?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
        const pip = document.getElementById('local-video');
        if (pip) pip.srcObject = screenStream;
        screenTrack.onended = () => this.toggleScreenShare();
        showToast('Sharing screen');
      } catch (e) { showToast('Screen share cancelled'); }
    }
  },

  // ── Flip camera ──────────────────────────────────────────
  async flipCamera() {
    CallState.facingMode = CallState.facingMode === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: CallState.facingMode }, audio: false
      });
      const videoTrack = newStream.getVideoTracks()[0];
      const pip = document.getElementById('local-video');
      if (pip) { const stream = new MediaStream([videoTrack]); pip.srcObject = stream; }
      const sender = CallState.peerConn?.getSenders().find(s => s.track?.kind === 'video');
      if (sender) sender.replaceTrack(videoTrack);
    } catch (e) { showToast('Cannot flip camera'); }
  },

  openKeypad() { showToast('DTMF keypad — coming soon'); },

  toggleExpand() {
    const vc = document.getElementById('video-call-view');
    if (document.fullscreenElement) document.exitFullscreen();
    else vc.requestFullscreen?.();
  },

  // ── Timer ────────────────────────────────────────────────
  startCallTimer() {
    CallState.callSeconds = 0;
    // Show connecting → timer
    document.getElementById('vc-calling-state')?.classList.add('hidden');
    document.getElementById('vc-timer')?.classList.remove('hidden');
    document.getElementById('vid-calling-state')?.classList.add('hidden');
    document.getElementById('vtb-status').textContent = '';
    document.getElementById('vtb-timer')?.classList.remove('hidden');
    // Animate waveform faster
    document.querySelectorAll('.wv-bar').forEach(b => { b.style.animationDuration = (0.4 + Math.random() * 0.5) + 's'; });

    clearInterval(CallState.callTimerInterval);
    CallState.callTimerInterval = setInterval(() => {
      CallState.callSeconds++;
      const t = _fmtDuration(CallState.callSeconds);
      const vcTimer = document.getElementById('vc-timer');
      const vtbTimer = document.getElementById('vtb-timer');
      if (vcTimer) vcTimer.textContent = t;
      if (vtbTimer) vtbTimer.textContent = t;
      // Update mini call bar
      const mini = document.getElementById('mini-call-bar-timer');
      if (mini) mini.textContent = t;
    }, 1000);
  },

  // ── WebRTC callbacks ─────────────────────────────────────
  onWebRTCOffer(data) {
    CallState.peerConn?.setRemoteDescription(data.offer).then(async () => {
      const answer = await CallState.peerConn.createAnswer();
      await CallState.peerConn.setLocalDescription(answer);
      socket?.emit('webrtc_answer', { to: data.from, answer });
    });
  },

  onWebRTCAnswer(data) {
    CallState.peerConn?.setRemoteDescription(data.answer);
    this.startCallTimer();
  },

  onWebRTCIce(data) {
    if (data.candidate) CallState.peerConn?.addIceCandidate(data.candidate).catch(() => {});
  },

  onCallAnswered() { this.startCallTimer(); },

  onCallDeclined() {
    this._teardown();
    showToast('Call declined');
  },

  onCallEnded(data) {
    this._teardown();
    showToast(`Call ended · ${_fmtDuration(data.duration || CallState.callSeconds)}`);
  },

  // ── Private helpers ───────────────────────────────────────
  _showActiveCall(type, name, avatar, isIncoming) {
    document.getElementById('active-call').classList.remove('hidden');

    if (type === 'video') {
      document.getElementById('voice-call-view').classList.add('hidden');
      document.getElementById('video-call-view').classList.remove('hidden');
      document.getElementById('vtb-avatar').src = avatar || '/static/img/default-avatar.png';
      document.getElementById('vtb-name').textContent = name;
      document.getElementById('remote-placeholder-img').src = avatar || '/static/img/default-avatar.png';
      document.getElementById('remote-placeholder-name').textContent = name;
      document.getElementById('pip-flip-btn').classList.remove('hidden');
    } else {
      document.getElementById('video-call-view').classList.add('hidden');
      document.getElementById('voice-call-view').classList.remove('hidden');
      document.getElementById('vc-avatar').src = avatar || '/static/img/default-avatar.png';
      document.getElementById('vc-name').textContent = name;
      // Try to get phone from contacts
      document.getElementById('vc-phone').textContent = '';
      document.getElementById('vc-calling-state').classList.remove('hidden');
      document.getElementById('vc-timer').classList.add('hidden');
    }
  },

  _attachLocalVideo() {
    const pip = document.getElementById('local-video');
    const flipBtn = document.getElementById('pip-flip-btn');
    if (pip && CallState.localStream) {
      pip.srcObject = CallState.localStream;
      pip.classList.remove('hidden');
      if (flipBtn) flipBtn.classList.remove('hidden');
    }
  },

  _setupPeer(remoteId) {
    CallState.peerConn = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    if (CallState.localStream) {
      CallState.localStream.getTracks().forEach(t => CallState.peerConn.addTrack(t, CallState.localStream));
    }

    CallState.peerConn.ontrack = e => {
      if (!CallState.remoteStream) CallState.remoteStream = new MediaStream();
      CallState.remoteStream.addTrack(e.track);
      const rv = document.getElementById('remote-video');
      if (rv) {
        rv.srcObject = CallState.remoteStream;
        rv.style.display = 'block';
        document.getElementById('remote-placeholder')?.classList.add('hidden');
        document.getElementById('vid-calling-state')?.classList.add('hidden');
      }
      if (!CallState.callTimerInterval) this.startCallTimer();
    };

    CallState.peerConn.onicecandidate = e => {
      if (e.candidate) {
        socket?.emit('webrtc_ice', { to: remoteId, candidate: e.candidate });
      }
    };

    CallState.peerConn.onconnectionstatechange = () => {
      const state = CallState.peerConn.connectionState;
      this._updateQualityIndicator(state);
    };
  },

  _teardown() {
    clearInterval(CallState.callTimerInterval);
    CallState.callTimerInterval = null;
    CallState.callSeconds = 0;
    if (CallState.localStream) { CallState.localStream.getTracks().forEach(t => t.stop()); CallState.localStream = null; }
    if (CallState.peerConn) { CallState.peerConn.close(); CallState.peerConn = null; }
    CallState.remoteStream = null;

    document.getElementById('incoming-call').classList.add('hidden');
    document.getElementById('active-call').classList.add('hidden');
    document.getElementById('remote-video').style.display = 'none';
    document.getElementById('local-video').classList.add('hidden');
    document.getElementById('pip-flip-btn').classList.add('hidden');
    document.getElementById('remote-placeholder').classList.remove('hidden');
    document.getElementById('remote-video').srcObject = null;
    document.getElementById('local-video').srcObject = null;
    document.getElementById('screen-share-badge').classList.add('hidden');
    document.getElementById('mini-call-bar')?.remove();

    CallState.currentCall = null;
    CallState.isIncoming = false;
    CallState.isMuted = false;
    CallState.isVideoOn = true;
    CallState.isSharingScreen = false;

    // Reset button states
    const vcMute = document.getElementById('vc-mute-btn');
    if (vcMute) { vcMute.querySelector('.vc-ctrl-icon').innerHTML = Icons.mic; vcMute.classList.remove('muted'); }
    const vidMute = document.getElementById('vid-mute-btn');
    if (vidMute) { vidMute.querySelector('.vid-ctrl-icon').innerHTML = Icons.mic; vidMute.classList.remove('off'); }
    const vidCam = document.getElementById('vid-cam-btn');
    if (vidCam) { vidCam.querySelector('.vid-ctrl-icon').innerHTML = Icons.video; vidCam.classList.remove('off'); }
  },

  _updateQualityIndicator(state) {
    const bars = document.querySelectorAll('.cq-bar');
    bars.forEach((b, i) => {
      b.classList.remove('low', 'poor');
      if (state === 'connected') { b.style.opacity = '0.8'; }
      else if (state === 'connecting') { if (i > 1) b.style.opacity = '0.2'; }
      else { b.classList.add('poor'); }
    });
  },

  _showCallToast(data) {
    const existing = document.querySelector('.call-toast-notif');
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.className = 'call-toast-notif';
    div.innerHTML = `
      <img class="ctn-avatar" src="${data.caller_avatar || '/static/img/default-avatar.png'}" alt="">
      <div class="ctn-info">
        <div class="ctn-label">${data.type === 'video' ? '📹 Incoming video' : '📞 Incoming call'}</div>
        <div class="ctn-name">${escHtml(data.caller_name)}</div>
      </div>
      <div class="ctn-actions">
        <button class="ctn-btn decline" onclick="CallUI.declineToast(this)">${Icons.end}</button>
        <button class="ctn-btn accept" onclick="CallUI.acceptToast(this,'${data.call_id}','${data.type}','${data.caller_id}','${data.caller_name}','${data.caller_avatar||''}')">${Icons.phone}</button>
      </div>`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 30000);
  },

  declineToast(btn) {
    btn.closest('.call-toast-notif').remove();
  },

  acceptToast(btn, callId, type, callerId, name, avatar) {
    btn.closest('.call-toast-notif').remove();
    CallState.currentCall = { call_id: callId, peerId: callerId, peerName: name, peerAvatar: avatar, type };
    CallState.isIncoming = true;
    this.accept();
  },
};

// ── Format helpers ────────────────────────────────────────────
function _fmtDuration(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ── Socket integration shim ───────────────────────────────────
// Call this after socket is initialized in chat.js
function initCallSocketHandlers() {
  if (typeof socket === 'undefined') return;

  socket.on('incoming_call', d => CallUI.showIncoming(d));
  socket.on('call_answered', ()  => CallUI.onCallAnswered());
  socket.on('call_declined', ()  => CallUI.onCallDeclined());
  socket.on('call_ended',    d   => CallUI.onCallEnded(d));
  socket.on('webrtc_offer',  d   => CallUI.onWebRTCOffer(d));
  socket.on('webrtc_answer', d   => CallUI.onWebRTCAnswer(d));
  socket.on('webrtc_ice',    d   => CallUI.onWebRTCIce(d));
}

// ── Global start-call helpers (called from chat header buttons) ─
function startVoiceCall() {
  if (!window.currentChat || window.currentChat.type !== 'dm') { showToast('Open a DM to call'); return; }
  CallUI.startCall(window.currentChat.id, window.currentChat.name, window.currentChat.avatar, 'voice');
}
function startVideoCall() {
  if (!window.currentChat || window.currentChat.type !== 'dm') { showToast('Open a DM to call'); return; }
  CallUI.startCall(window.currentChat.id, window.currentChat.name, window.currentChat.avatar, 'video');
}

// Toast helper (fallback)
function showToast(msg) {
  if (typeof toast === 'function') { toast(msg); return; }
  const t = document.getElementById('toast');
  if (t) { t.textContent = msg; t.classList.remove('hidden'); setTimeout(() => t.classList.add('hidden'), 3000); }
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  buildCallUI();
  // Wait for socket to be ready
  const waitSocket = setInterval(() => {
    if (typeof socket !== 'undefined') {
      initCallSocketHandlers();
      clearInterval(waitSocket);
    }
  }, 200);
});
