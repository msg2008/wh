// ── State ──────────────────────────────────────────────────────────────────────
let me = null, socket = null;
let currentChat = null; // {type:'dm'|'group', id, name, avatar}
let allChats = [];
let currentPage = 1, hasMore = false;
let isTyping = false, typingTimer = null;
let replyTo = null;
let contextTarget = null; // {msgId, senderId}
let selectedGroupMembers = [];
let voiceRecorder = null, voiceChunks = [], recTimerInterval = null, recSeconds = 0;
let currentCall = null; // {call_id, type}
let peerConnection = null;
let localStream = null, remoteStream = null;
let callTimerInterval = null, callSeconds = 0;
let isMuted = false, isSpeakerOn = true, isVideoOn = true;
let statusList = [], currentStatusIdx = 0, statusTimer = null;
let statusBgColor = '#075E54', statusMediaUrl = '';
let searchResults = [], searchIdx = 0;
let allGroupUsersCache = [];
let forwardTargets = [];

const EMOJIS = ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤫','🤭','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','👍','👎','👏','🙏','🤝','👋','✌️','🤞','🤟','🤘','👌','👈','👉','👆','👇','☝️','✋','🤚','🖐','🖖','🤙','💪','🦾','🖕','🤜','🤛','🤞','✊','👊','🙌','👐','🤲','🫶','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️','🔥','⭐','🌟','✨','💫','🎉','🎊','🎈','🎁','🏆','🥇','🎯','🚀','💯','✅','❌','⚠️','🔔','🔕','📱','💻','⌨️','🖥','🖨','🖱','🖲','💽','💾','💿','📀','📞','☎️','📟','📠'];

// ── Init ───────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const r = await fetch('/api/me');
    if (!r.ok) { window.location = '/login'; return; }
    me = await r.json();
    applyTheme(me.theme || 'light');
    document.getElementById('my-avatar').src = me.avatar || '/static/img/default-avatar.png';
    loadChats();
    initSocket();
    buildEmojiPicker();
    setPrivacyToggles();
    document.getElementById('settings-profile-sub').textContent = me.username;
    document.getElementById('settings-theme-sub').textContent = me.theme === 'dark' ? 'Dark' : 'Light';
    loadCalls();
  } catch(e) { console.error(e); window.location = '/login'; }
}

function applyTheme(t) {
  document.body.classList.toggle('theme-dark', t === 'dark');
  document.body.classList.toggle('theme-light', t !== 'dark');
}

// ── Socket.IO ──────────────────────────────────────────────────────────────────
function initSocket() {
  socket = io();
  socket.on('connect', () => console.log('Socket connected'));

  socket.on('new_message', (msg) => {
    if (isCurrentChat(msg)) { appendMessage(msg); scrollToBottom(); }
    updateChatItemLastMsg(msg);
    if (!isCurrentChat(msg) && me.notifications) showNotification(msg);
  });

  socket.on('chat_notification', (data) => {
    updateChatItemLastMsg(data.message);
    if (!isCurrentChat(data.message)) showNotification(data.message);
  });

  socket.on('message_deleted', (data) => {
    const el = document.querySelector(`[data-id="${data.id}"]`);
    if (el) {
      const tb = el.querySelector('.msg-text');
      if (tb) { tb.textContent = 'This message was deleted'; tb.classList.add('deleted'); }
    }
  });

  socket.on('message_edited', (msg) => {
    const el = document.querySelector(`[data-id="${msg.id}"]`);
    if (el) {
      const tb = el.querySelector('.msg-text');
      if (tb) tb.innerHTML = escHtml(msg.content) + (msg.is_edited ? ' <em class="msg-edited">(edited)</em>' : '');
    }
  });

  socket.on('reaction_updated', (msg) => {
    const el = document.querySelector(`[data-id="${msg.id}"]`);
    if (el) {
      let rc = el.querySelector('.msg-reactions');
      if (!rc) { rc = document.createElement('div'); rc.className = 'msg-reactions'; el.querySelector('.msg-bubble').appendChild(rc); }
      rc.innerHTML = buildReactionsHtml(msg.reactions, msg.id);
    }
  });

  socket.on('user_typing', (data) => {
    if (!currentChat) return;
    const isRelevant = (currentChat.type === 'dm' && data.user_id === currentChat.id) ||
                       (currentChat.type === 'group');
    if (!isRelevant) return;
    const ti = document.getElementById('typing-indicator');
    if (data.is_typing) { ti.classList.remove('hidden'); ti.querySelector('span').parentElement.setAttribute('title', data.username + ' is typing...'); }
    else ti.classList.add('hidden');
  });

  socket.on('online_status', (data) => {
    if (currentChat?.type === 'dm' && currentChat.id === data.user_id) {
      document.getElementById('chat-status').textContent = data.is_online ? 'online' : `last seen ${formatLastSeen(data.last_seen)}`;
    }
    const item = document.querySelector(`.chat-item[data-id="${data.user_id}"][data-type="dm"]`);
    if (item) {
      const dot = item.querySelector('.online-dot');
      if (data.is_online) { if (!dot) item.querySelector('.chat-item-avatar').insertAdjacentHTML('afterend', '<div class="online-dot"></div>'); }
      else if (dot) dot.remove();
    }
  });

  socket.on('messages_read', (data) => {
    data.message_ids.forEach(id => {
      const el = document.querySelector(`[data-id="${id}"] .msg-ticks`);
      if (el) { el.textContent = '✓✓'; el.classList.add('read'); }
    });
  });

  socket.on('group_created', () => loadChats());
  socket.on('group_updated', () => loadChats());
  socket.on('group_member_added', () => { if (currentChat?.type === 'group') openChat(currentChat); });
  socket.on('group_member_removed', (data) => {
    if (data.user_id === me.id) { closeChat(); toast('You were removed from the group'); loadChats(); }
  });

  socket.on('incoming_call', (data) => {
    // Handled by calls.js CallUI
    if (typeof CallUI !== 'undefined') CallUI.showIncoming(data);
  });
  socket.on('call_answered', () => { if (typeof CallUI !== 'undefined') CallUI.onCallAnswered(); });
  socket.on('call_declined', () => { if (typeof CallUI !== 'undefined') CallUI.onCallDeclined(); });
  socket.on('call_ended',    (d) => { if (typeof CallUI !== 'undefined') CallUI.onCallEnded(d); });
  socket.on('webrtc_offer',  (d) => { if (typeof CallUI !== 'undefined') CallUI.onWebRTCOffer(d); });
  socket.on('webrtc_answer', (d) => { if (typeof CallUI !== 'undefined') CallUI.onWebRTCAnswer(d); });
  socket.on('webrtc_ice',    (d) => { if (typeof CallUI !== 'undefined') CallUI.onWebRTCIce(d); });
}

function isCurrentChat(msg) {
  if (!currentChat) return false;
  if (msg.group_id) return currentChat.type === 'group' && currentChat.id === msg.group_id;
  return currentChat.type === 'dm' && (msg.sender_id === currentChat.id || msg.receiver_id === currentChat.id);
}

// ── Chats ──────────────────────────────────────────────────────────────────────
async function loadChats() {
  const r = await fetch('/api/chats');
  allChats = await r.json();
  renderChatList(allChats);
}

function renderChatList(chats) {
  const list = document.getElementById('chat-list-panel');
  document.getElementById('chats-loading').style.display = 'none';
  list.innerHTML = '<div id="chats-loading" style="display:none"></div>';
  if (!chats.length) { list.innerHTML += '<div style="text-align:center;padding:40px;color:#667781">No chats yet.<br>Start a new chat!</div>'; return; }
  chats.forEach(c => list.appendChild(buildChatItem(c)));
}

function buildChatItem(c) {
  const div = document.createElement('div');
  div.className = 'chat-item' + (currentChat?.id === c.id && currentChat?.type === c.type ? ' active' : '');
  div.dataset.id = c.id;
  div.dataset.type = c.type;
  div.dataset.name = c.name.toLowerCase();
  const lm = c.last_message;
  const lmText = lm ? (lm.deleted_for_everyone ? 'This message was deleted' : lm.type !== 'text' ? `📎 ${lm.type}` : lm.content.substring(0, 40)) : '';
  const lmTime = lm ? formatTime(lm.timestamp) : '';
  const onlineHtml = c.type === 'dm' && c.is_online ? '<div class="online-dot" style="position:absolute;bottom:12px;left:52px;width:10px;height:10px;background:#25D366;border-radius:50%;border:2px solid #fff;z-index:1"></div>' : '';
  div.innerHTML = `
    <div style="position:relative">
      <img class="chat-item-avatar" src="${c.avatar || '/static/img/default-avatar.png'}" alt="${c.name}" onerror="this.src='/static/img/default-avatar.png'">
      ${onlineHtml}
    </div>
    <div class="chat-item-info">
      <div class="chat-item-row1">
        <div class="chat-item-name">${escHtml(c.name)}${c.muted ? ' 🔇' : ''}</div>
        <div class="chat-item-time ${c.unread > 0 ? 'unread' : ''}" style="${c.unread > 0 ? 'color:#25D366' : ''}">${lmTime}</div>
      </div>
      <div class="chat-item-row2">
        <div class="chat-item-last">${escHtml(lmText)}</div>
        ${c.unread > 0 ? `<div class="unread-badge">${c.unread > 99 ? '99+' : c.unread}</div>` : ''}
      </div>
    </div>`;
  div.addEventListener('click', () => openChat(c));
  div.addEventListener('contextmenu', e => { e.preventDefault(); showChatItemMenu(e, c); });
  return div;
}

async function openChat(c) {
  currentChat = { type: c.type, id: c.id, name: c.name, avatar: c.avatar };
  currentPage = 1; hasMore = false; replyTo = null;

  // UI
  document.getElementById('welcome-screen').classList.add('hidden');
  document.getElementById('chat-window').classList.remove('hidden');
  document.getElementById('chat-name').textContent = c.name;
  document.getElementById('chat-avatar').src = c.avatar || '/static/img/default-avatar.png';
  document.getElementById('reply-preview').classList.add('hidden');
  document.getElementById('in-chat-search').classList.add('hidden');
  document.getElementById('pinned-msg-bar').classList.add('hidden');

  // Active state
  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
  const activeItem = document.querySelector(`.chat-item[data-id="${c.id}"][data-type="${c.type}"]`);
  if (activeItem) activeItem.classList.add('active');

  // Status
  if (c.type === 'dm') {
    const usr = await fetch(`/api/users/${c.id}`).then(r => r.json());
    document.getElementById('chat-status').textContent = usr.is_online ? 'online' : `last seen ${formatLastSeen(usr.last_seen)}`;
    socket.emit('join_dm', { other_id: c.id });
  } else {
    const g = await fetch(`/api/groups/${c.id}`).then(r => r.json());
    document.getElementById('chat-status').textContent = `${g.members.length} participants`;
    socket.emit('join_group', { group_id: c.id });
  }

  // Load messages
  await loadMessages(true);
  loadPinnedMessage();
  scrollToBottom(true);

  // Mobile
  document.getElementById('chat-window').classList.add('mobile-active');
}

function closeChat() {
  document.getElementById('welcome-screen').classList.remove('hidden');
  document.getElementById('chat-window').classList.add('hidden');
  document.getElementById('chat-window').classList.remove('mobile-active');
  currentChat = null;
  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
}

async function loadMessages(reset = false) {
  if (!currentChat) return;
  const page = reset ? 1 : currentPage + 1;
  const url = currentChat.type === 'dm' ? `/api/messages/dm/${currentChat.id}?page=${page}` : `/api/messages/group/${currentChat.id}?page=${page}`;
  const data = await fetch(url).then(r => r.json());
  if (reset) {
    document.getElementById('messages-container').innerHTML = '';
    currentPage = 1;
  } else {
    currentPage = page;
  }
  hasMore = data.has_more;
  document.getElementById('load-more-btn').classList.toggle('hidden', !hasMore);
  const container = document.getElementById('messages-container');
  let lastDate = null;
  data.messages.forEach(m => {
    const ts = m.timestamp.endsWith('Z') ? m.timestamp : m.timestamp + 'Z';
    const d = new Date(ts).toDateString();
    if (d !== lastDate) {
      lastDate = d;
      container.appendChild(buildDateDivider(new Date(ts)));
    }
    container.appendChild(buildMessageEl(m));
  });
  markMessagesRead(data.messages.filter(m => m.sender_id !== me.id).map(m => m.id));
}

function loadMoreMessages() { loadMessages(false); }

function buildDateDivider(date) {
  const div = document.createElement('div'); div.className = 'date-divider';
  const today = new Date(), yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  let label = date.toDateString() === today.toDateString() ? 'Today' :
               date.toDateString() === yesterday.toDateString() ? 'Yesterday' :
               date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  div.innerHTML = `<span>${label}</span>`; return div;
}

function buildMessageEl(m) {
  const wrapper = document.createElement('div');
  wrapper.className = 'msg-wrapper ' + (m.sender_id === me.id ? 'out' : 'in');
  wrapper.dataset.id = m.id;

  const bubble = document.createElement('div'); bubble.className = 'msg-bubble';
  let html = '';

  // Group sender name
  if (currentChat?.type === 'group' && m.sender_id !== me.id) {
    html += `<div class="msg-sender-name" style="color:${stringToColor(m.sender_name)}">${escHtml(m.sender_name)}</div>`;
  }

  // Forwarded
  if (m.forwarded_from_id) html += `<div style="font-size:12px;color:#667781;margin-bottom:4px">↪ Forwarded</div>`;

  // Reply
  if (m.reply_to) {
    html += `<div class="msg-reply" onclick="scrollToMessage(${m.reply_to.id})">
      <div class="msg-reply-sender">${escHtml(m.reply_to.sender)}</div>
      <div class="msg-reply-text">${m.reply_to.type !== 'text' ? '📎 ' + m.reply_to.type : escHtml(m.reply_to.content)}</div>
    </div>`;
  }

  // Content
  if (m.deleted_for_everyone) {
    html += `<div class="msg-text deleted">🚫 This message was deleted</div>`;
  } else {
    html += buildMsgContent(m);
  }

  // Footer
  const ticks = m.sender_id === me.id ? `<span class="msg-ticks ${m.read_by.length > 0 ? 'read' : ''}">✓✓</span>` : '';
  const edited = m.is_edited ? '<span class="msg-edited">edited</span>' : '';
  const starred = m.is_starred ? '⭐' : '';
  html += `<div class="msg-footer">${edited}${starred}<span class="msg-time">${formatTime(m.timestamp)}</span>${ticks}</div>`;

  // Reactions
  if (m.reactions && Object.keys(m.reactions).length > 0) {
    html += `<div class="msg-reactions">${buildReactionsHtml(m.reactions, m.id)}</div>`;
  }

  // Actions
  html += `<div class="msg-actions">
    <button onclick="setReplyTo(${m.id})" title="Reply">↩</button>
    <button onclick="showReactionPicker(event,${m.id})" title="React">😊</button>
    <button onclick="showContextMenu(event,${m.id},${m.sender_id})" title="More">⋮</button>
  </div>`;

  bubble.innerHTML = html;
  wrapper.appendChild(bubble);
  wrapper.addEventListener('contextmenu', e => { e.preventDefault(); showContextMenu(e, m.id, m.sender_id); });
  return wrapper;
}

function buildMsgContent(m) {
  switch(m.type) {
    case 'image':
      return `<img class="msg-image" src="${m.file_url}" alt="Image" onclick="openLightbox('${m.file_url}','image')" loading="lazy">
              ${m.content ? `<div class="msg-text">${escHtml(m.content)}</div>` : ''}`;
    case 'video':
      return `<video class="msg-video" src="${m.file_url}" controls preload="metadata"></video>
              ${m.content ? `<div class="msg-text">${escHtml(m.content)}</div>` : ''}`;
    case 'audio':
      return `<audio class="msg-audio" src="${m.file_url}" controls></audio>`;
    case 'voice':
      return buildVoiceMessage(m);
    case 'file':
      const size = m.file_size ? formatBytes(m.file_size) : '';
      return `<div class="msg-file" onclick="window.open('${m.file_url}')">
        <div class="msg-file-icon">📄</div>
        <div class="msg-file-info"><div class="fname">${escHtml(m.file_name || 'File')}</div><div class="fsize">${size}</div></div>
      </div>`;
    case 'location':
      const mapUrl = `https://www.openstreetmap.org/?mlat=${m.latitude}&mlon=${m.longitude}&zoom=15`;
      const imgUrl = `https://static-maps.yandex.ru/1.x/?ll=${m.longitude},${m.latitude}&z=15&size=200,120&l=map&pt=${m.longitude},${m.latitude},pmorg`;
      return `<div class="msg-location" onclick="window.open('${mapUrl}')">
        <div style="width:200px;height:120px;background:#e0e0e0;display:flex;align-items:center;justify-content:center;border-radius:8px 8px 0 0;font-size:32px">📍</div>
        <div class="msg-location-text">📍 Location (${m.latitude?.toFixed(4)}, ${m.longitude?.toFixed(4)})</div>
      </div>`;
    case 'sticker':
      return `<img class="msg-sticker" src="${m.file_url}" alt="Sticker">`;
    default:
      return `<div class="msg-text">${escHtml(m.content)}</div>`;
  }
}

function buildVoiceMessage(m) {
  return `<div class="voice-msg">
    <button class="voice-play-btn" onclick="playVoice(this,'${m.file_url}')">▶</button>
    <div class="voice-waveform"><canvas width="120" height="30"></canvas></div>
    <span class="voice-duration">${formatDuration(m.duration)}</span>
  </div>`;
}

function buildReactionsHtml(reactions, msgId) {
  return Object.entries(reactions).map(([emoji, users]) =>
    `<span class="reaction-chip" onclick="reactMsg(${msgId},'${emoji}')" title="${users.map(u=>u.name).join(', ')}">${emoji}<span class="count">${users.length}</span></span>`
  ).join('');
}

function appendMessage(m) {
  const container = document.getElementById('messages-container');
  const lastDivider = container.querySelector('.date-divider:last-child');
  const today = new Date().toDateString();
  if (!lastDivider || new Date(lastDivider.dataset.date || 0).toDateString() !== today) {
    const d = buildDateDivider(new Date()); d.dataset.date = Date.now(); container.appendChild(d);
  }
  container.appendChild(buildMessageEl(m));
}

async function sendMessage() {
  const box = document.getElementById('input-box');
  const content = box.innerText.trim();
  if (!content || !currentChat) return;
  box.innerHTML = ''; box.innerText = '';
  toggleSendMic();
  const data = {
    content, type: 'text',
    receiver_id: currentChat.type === 'dm' ? currentChat.id : null,
    group_id: currentChat.type === 'group' ? currentChat.id : null,
    reply_to_id: replyTo?.id || null
  };
  socket.emit('send_message', data);
  cancelReply();
  scrollToBottom();
}

// ── Typing ─────────────────────────────────────────────────────────────────────
function onTyping() {
  const box = document.getElementById('input-box');
  const txt = box.innerText.trim();
  toggleSendMic();
  if (!currentChat) return;
  const room = currentChat.type === 'group' ? `group_${currentChat.id}` :
    `dm_${Math.min(me.id, currentChat.id)}_${Math.max(me.id, currentChat.id)}`;
  if (!isTyping) { isTyping = true; socket.emit('typing', { room, is_typing: true }); }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => { isTyping = false; socket.emit('typing', { room, is_typing: false }); }, 2000);
}

function toggleSendMic() {
  const txt = document.getElementById('input-box').innerText.trim();
  document.getElementById('send-btn').style.display = txt ? 'flex' : 'none';
  document.getElementById('mic-btn').style.display = txt ? 'none' : 'flex';
}

function onInputKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

// ── File Upload ────────────────────────────────────────────────────────────────
async function handleFileUpload(e, hint) {
  const file = e.target.files[0]; if (!file) return;
  document.getElementById('attachment-menu').classList.add('hidden');
  toast('Uploading...');
  const fd = new FormData(); fd.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: fd }).then(r => r.json());
  if (!res.url) { toast('Upload failed'); return; }
  const caption = document.getElementById('input-box').innerText.trim();
  const data = {
    type: res.type, file_url: res.url, file_name: res.name, file_size: res.size,
    thumbnail: res.thumbnail, content: caption,
    receiver_id: currentChat.type === 'dm' ? currentChat.id : null,
    group_id: currentChat.type === 'group' ? currentChat.id : null,
    reply_to_id: replyTo?.id || null
  };
  socket.emit('send_message', data);
  document.getElementById('input-box').innerHTML = ''; toggleSendMic(); cancelReply();
  e.target.value = '';
}

// ── Voice Messages ─────────────────────────────────────────────────────────────
async function toggleVoiceRecord() {
  if (voiceRecorder && voiceRecorder.state !== 'inactive') {
    voiceRecorder.stop();
  } else {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceChunks = []; recSeconds = 0;
      voiceRecorder = new MediaRecorder(stream);
      voiceRecorder.ondataavailable = e => voiceChunks.push(e.data);
      voiceRecorder.onstop = async () => {
        clearInterval(recTimerInterval);
        stream.getTracks().forEach(t => t.stop());
        document.getElementById('recording-indicator').classList.add('hidden');
        const blob = new Blob(voiceChunks, { type: 'audio/webm' });
        const fd = new FormData(); fd.append('file', blob, 'voice.webm');
        const res = await fetch('/api/upload', { method: 'POST', body: fd }).then(r => r.json());
        if (res.url) {
          socket.emit('send_message', {
            type: 'voice', file_url: res.url, duration: recSeconds,
            receiver_id: currentChat?.type === 'dm' ? currentChat.id : null,
            group_id: currentChat?.type === 'group' ? currentChat.id : null
          });
        }
      };
      voiceRecorder.start();
      document.getElementById('recording-indicator').classList.remove('hidden');
      recTimerInterval = setInterval(() => {
        recSeconds++;
        document.getElementById('rec-timer').textContent = formatDuration(recSeconds);
      }, 1000);
    } catch(e) { toast('Microphone access denied'); }
  }
}

function cancelVoiceRecord() {
  if (voiceRecorder && voiceRecorder.state !== 'inactive') {
    voiceRecorder.ondataavailable = null; voiceRecorder.onstop = null; voiceRecorder.stop();
    clearInterval(recTimerInterval); document.getElementById('recording-indicator').classList.add('hidden');
  }
}

function playVoice(btn, url) {
  const audio = new Audio(url);
  btn.textContent = '⏸';
  audio.play();
  audio.onended = () => btn.textContent = '▶';
  audio.onerror = () => { btn.textContent = '▶'; toast('Cannot play audio'); };
}

// ── Location ───────────────────────────────────────────────────────────────────
function shareLocation() {
  document.getElementById('attachment-menu').classList.add('hidden');
  if (!navigator.geolocation) { toast('Geolocation not supported'); return; }
  toast('Getting your location...');
  navigator.geolocation.getCurrentPosition(pos => {
    socket.emit('send_message', {
      type: 'location', latitude: pos.coords.latitude, longitude: pos.coords.longitude,
      receiver_id: currentChat?.type === 'dm' ? currentChat.id : null,
      group_id: currentChat?.type === 'group' ? currentChat.id : null
    });
  }, () => toast('Location access denied'));
}

// ── Reply ──────────────────────────────────────────────────────────────────────
async function setReplyTo(msgId) {
  const el = document.querySelector(`[data-id="${msgId}"]`);
  if (!el) return;
  const textEl = el.querySelector('.msg-text');
  const senderEl = el.querySelector('.msg-sender-name');
  replyTo = { id: msgId, text: textEl?.textContent || 'Media', sender: senderEl?.textContent || 'You' };
  document.getElementById('reply-sender').textContent = replyTo.sender;
  document.getElementById('reply-text').textContent = replyTo.text;
  document.getElementById('reply-preview').classList.remove('hidden');
  document.getElementById('input-box').focus();
}

function cancelReply() {
  replyTo = null;
  document.getElementById('reply-preview').classList.add('hidden');
}

function scrollToMessage(msgId) {
  const el = document.querySelector(`[data-id="${msgId}"]`);
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.background = 'rgba(0,0,0,.1)'; setTimeout(() => el.style.background = '', 1500); }
}

// ── Context Menu ───────────────────────────────────────────────────────────────
function showContextMenu(e, msgId, senderId) {
  e.preventDefault();
  closeAllDropdowns();
  contextTarget = { msgId, senderId };
  const cm = document.getElementById('context-menu'); cm.classList.remove('hidden');
  document.getElementById('ctx-edit-btn').style.display = senderId === me.id ? '' : 'none';
  cm.style.top = Math.min(e.clientY, window.innerHeight - 300) + 'px';
  cm.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
}

function ctx_reply() { if (contextTarget) setReplyTo(contextTarget.msgId); closeAllDropdowns(); }
function ctx_react() { if (contextTarget) { const el = document.querySelector(`[data-id="${contextTarget.msgId}"]`); if (el) showReactionPicker({clientX: el.getBoundingClientRect().left, clientY: el.getBoundingClientRect().top}, contextTarget.msgId); } closeAllDropdowns(); }
function ctx_copy() { const el = document.querySelector(`[data-id="${contextTarget?.msgId}"] .msg-text`); if (el) navigator.clipboard.writeText(el.textContent); closeAllDropdowns(); toast('Copied'); }
function ctx_star() { if (contextTarget) starMessage(contextTarget.msgId); closeAllDropdowns(); }
function ctx_pin() { if (contextTarget && currentChat) { fetch('/api/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_type: currentChat.type, chat_id: currentChat.id, message_id: contextTarget.msgId }) }); toast('Message pinned'); loadPinnedMessage(); } closeAllDropdowns(); }
function ctx_forward() { if (contextTarget) openForwardModal(contextTarget.msgId); closeAllDropdowns(); }
function ctx_edit() { if (contextTarget) editMessagePrompt(contextTarget.msgId); closeAllDropdowns(); }
function ctx_info() { if (contextTarget) showMsgInfo(contextTarget.msgId); closeAllDropdowns(); }
function ctx_delete() { if (contextTarget) showDeleteDialog(contextTarget.msgId, contextTarget.senderId); closeAllDropdowns(); }

function showDeleteDialog(msgId, senderId) {
  const isOwn = senderId === me.id;
  const r = confirm(isOwn ? 'Delete for everyone or just for me?\nOK = Everyone, Cancel = Just me' : 'Delete this message for yourself?');
  if (r !== null) deleteMessage(msgId, isOwn && r);
}

async function deleteMessage(msgId, forEveryone) {
  await fetch(`/api/messages/${msgId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ for_everyone: forEveryone }) });
  if (!forEveryone) { const el = document.querySelector(`[data-id="${msgId}"]`); if (el) el.remove(); }
}

async function editMessagePrompt(msgId) {
  const el = document.querySelector(`[data-id="${msgId}"] .msg-text`);
  if (!el) return;
  const newText = prompt('Edit message:', el.textContent);
  if (newText === null || newText === el.textContent) return;
  await fetch(`/api/messages/${msgId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: newText }) });
}

async function starMessage(msgId) {
  const r = await fetch(`/api/messages/${msgId}/star`, { method: 'POST' }).then(r => r.json());
  toast(r.starred ? 'Message starred ⭐' : 'Star removed');
}

async function showMsgInfo(msgId) {
  const container = document.querySelector(`[data-id="${msgId}"]`);
  if (!container) return;
  const timeEl = container.querySelector('.msg-time');
  const readEl = container.querySelector('.msg-ticks');
  document.getElementById('msg-info-content').innerHTML = `
    <div>Sent: ${timeEl?.textContent || ''}</div>
    <div>Status: ${readEl?.classList.contains('read') ? 'Read ✓✓' : 'Delivered ✓✓'}</div>`;
  document.getElementById('msg-info-modal').classList.remove('hidden');
  document.getElementById('msg-info-modal').classList.add('center');
}

// ── Reactions ─────────────────────────────────────────────────────────────────
function showReactionPicker(e, msgId) {
  const rp = document.getElementById('reaction-picker');
  rp.classList.remove('hidden');
  rp._msgId = msgId;
  rp.style.top = (e.clientY - 60) + 'px';
  rp.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
}

async function reactWithEmoji(emoji) {
  const rp = document.getElementById('reaction-picker');
  const msgId = rp._msgId; rp.classList.add('hidden');
  if (!msgId) return;
  await fetch(`/api/messages/${msgId}/react`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji }) });
}

async function reactMsg(msgId, emoji) {
  await fetch(`/api/messages/${msgId}/react`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji }) });
}

// ── Forward ────────────────────────────────────────────────────────────────────
let forwardMsgId = null;
async function openForwardModal(msgId) {
  forwardMsgId = msgId;
  const list = document.getElementById('forward-list');
  list.innerHTML = '';
  allChats.forEach(c => {
    const div = document.createElement('div'); div.className = 'forward-item';
    div.innerHTML = `<input type="checkbox" value="${c.type}:${c.id}"><img src="${c.avatar || '/static/img/default-avatar.png'}" onerror="this.src='/static/img/default-avatar.png'" alt=""><div><div>${escHtml(c.name)}</div></div>`;
    list.appendChild(div);
  });
  document.getElementById('forward-modal').classList.remove('hidden');
  document.getElementById('forward-modal').classList.add('center');
}

async function doForward() {
  const checked = document.querySelectorAll('#forward-list input:checked');
  const dms = [], groups = [];
  checked.forEach(c => { const [type, id] = c.value.split(':'); (type === 'group' ? groups : dms).push(parseInt(id)); });
  if (dms.length) socket.emit('forward_message', { message_id: forwardMsgId, receivers: dms, group: false });
  if (groups.length) socket.emit('forward_message', { message_id: forwardMsgId, receivers: groups, group: true });
  closeModal('forward-modal'); toast('Message forwarded');
}

// ── Read Receipts ─────────────────────────────────────────────────────────────
function markMessagesRead(ids) {
  if (!ids.length) return;
  socket.emit('mark_read', { message_ids: ids });
}

// ── Pinned Messages ────────────────────────────────────────────────────────────
async function loadPinnedMessage() {
  if (!currentChat) return;
  const data = await fetch(`/api/pin/${currentChat.type}/${currentChat.id}`).then(r => r.json());
  if (data && data.content) {
    document.getElementById('pin-text').textContent = data.content.substring(0, 60);
    document.getElementById('pinned-msg-bar').classList.remove('hidden');
    document.getElementById('pinned-msg-bar')._msgId = data.id;
  }
}

function scrollToPinned() { scrollToMessage(document.getElementById('pinned-msg-bar')._msgId); }
function removePinnedBar() { document.getElementById('pinned-msg-bar').classList.add('hidden'); }

// ── In-chat Search ─────────────────────────────────────────────────────────────
function toggleChatSearch() {
  document.getElementById('in-chat-search').classList.toggle('hidden');
  document.querySelector('#in-chat-search input').focus();
}
function closeChatSearch() { document.getElementById('in-chat-search').classList.add('hidden'); clearHighlights(); }

async function searchChatMessages(q) {
  clearHighlights();
  if (!q || q.length < 2) { document.getElementById('search-count').textContent = ''; searchResults = []; return; }
  const msgs = document.querySelectorAll('.msg-text');
  searchResults = [];
  msgs.forEach(el => { if (el.textContent.toLowerCase().includes(q.toLowerCase())) searchResults.push(el); });
  searchResults.forEach(el => { el.innerHTML = el.textContent.replace(new RegExp(q, 'gi'), m => `<mark class="highlight">${m}</mark>`); });
  searchIdx = Math.max(0, searchResults.length - 1);
  document.getElementById('search-count').textContent = `${searchResults.length} results`;
  if (searchResults.length) searchResults[searchIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearHighlights() { document.querySelectorAll('.highlight').forEach(el => { const p = el.parentNode; p.innerHTML = p.textContent; }); }
function nextSearchResult() { if (!searchResults.length) return; searchIdx = (searchIdx + 1) % searchResults.length; searchResults[searchIdx].scrollIntoView({ behavior: 'smooth', block: 'center' }); }
function prevSearchResult() { if (!searchResults.length) return; searchIdx = (searchIdx - 1 + searchResults.length) % searchResults.length; searchResults[searchIdx].scrollIntoView({ behavior: 'smooth', block: 'center' }); }

// ── Emoji Picker ───────────────────────────────────────────────────────────────
function buildEmojiPicker() {
  const ep = document.getElementById('emoji-picker');
  EMOJIS.forEach(em => { const span = document.createElement('span'); span.textContent = em; span.onclick = () => insertEmoji(em); ep.appendChild(span); });
}

function toggleEmojiPicker() { document.getElementById('emoji-picker').classList.toggle('hidden'); }

function insertEmoji(em) {
  const box = document.getElementById('input-box'); box.focus();
  const sel = window.getSelection(); const range = sel.getRangeAt(0);
  const text = document.createTextNode(em); range.insertNode(text); range.setStartAfter(text); range.collapse(true); sel.removeAllRanges(); sel.addRange(range);
  toggleSendMic();
}

// ── Attachments ────────────────────────────────────────────────────────────────
function openAttachment() {
  closeAllDropdowns();
  document.getElementById('attachment-menu').classList.toggle('hidden');
}

// ── Avatar Upload ─────────────────────────────────────────────────────────────
function triggerAvatarUpload() { document.getElementById('avatar-file-input').click(); }

async function uploadAvatar(e) {
  const file = e.target.files[0]; if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  const res = await fetch('/api/upload/avatar', { method: 'POST', body: fd }).then(r => r.json());
  if (res.url) {
    me.avatar = res.url;
    document.getElementById('my-avatar').src = res.url;
    document.getElementById('profile-avatar').src = res.url;
    toast('Avatar updated');
  }
}

// ── Profile ────────────────────────────────────────────────────────────────────
function openMyProfile() {
  closeModal('settings-modal');
  document.getElementById('profile-avatar').src = me.avatar || '/static/img/default-avatar.png';
  document.getElementById('profile-username').textContent = me.username;
  document.getElementById('profile-about').textContent = me.about;
  document.getElementById('profile-phone').textContent = me.phone;
  document.getElementById('profile-email').textContent = me.email || '—';
  document.getElementById('profile-modal').classList.remove('hidden');
}

async function editField(field) {
  const labels = { username: 'Username', about: 'About', email: 'Email' };
  const cur = document.getElementById(`profile-${field}`).textContent;
  const val = prompt(`Edit ${labels[field]}:`, cur);
  if (val === null || val === cur) return;
  await fetch('/api/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: val }) });
  me[field] = val;
  document.getElementById(`profile-${field}`).textContent = val;
  document.getElementById('settings-profile-sub').textContent = field === 'username' ? val : me.username;
  if (field === 'username' && currentChat?.type === 'dm') document.getElementById('chat-name').textContent = val;
  toast('Updated!');
}

async function openChatInfo() {
  if (!currentChat) return;
  if (currentChat.type === 'group') { openGroupInfo(); return; }
  const u = await fetch(`/api/users/${currentChat.id}`).then(r => r.json());
  document.getElementById('contact-info-title').textContent = 'Contact Info';
  document.getElementById('contact-info-avatar').src = u.avatar || '/static/img/default-avatar.png';
  document.getElementById('contact-info-name').textContent = u.username;
  document.getElementById('contact-info-about').textContent = u.about;
  document.getElementById('contact-info-phone').textContent = u.phone;
  document.getElementById('contact-about-text').textContent = u.about;
  document.getElementById('contact-info-modal').classList.remove('hidden');
}

async function openGroupInfo() {
  const g = await fetch(`/api/groups/${currentChat.id}`).then(r => r.json());
  document.getElementById('contact-info-title').textContent = 'Group Info';
  document.getElementById('contact-info-avatar').src = g.avatar || '/static/img/default-avatar.png';
  document.getElementById('contact-info-name').textContent = g.name;
  document.getElementById('contact-info-about').textContent = `${g.members.length} members`;
  document.getElementById('contact-info-phone').textContent = g.description;
  document.getElementById('contact-about-text').innerHTML = g.members.map(m =>
    `<div class="user-result" style="cursor:default"><img src="${m.avatar||'/static/img/default-avatar.png'}" onerror="this.src='/static/img/default-avatar.png'" alt="" style="width:36px;height:36px;border-radius:50%"><div><div class="user-result-name">${escHtml(m.username)}${g.admins.includes(m.id)?'<span class="group-badge">Admin</span>':''}</div><div class="user-result-sub">${m.about||''}</div></div></div>`
  ).join('');
  document.getElementById('contact-info-modal').classList.remove('hidden');
}

// ── New Chat ───────────────────────────────────────────────────────────────────
function openNewChat() {
  document.getElementById('new-chat-modal').classList.remove('hidden');
  document.getElementById('new-chat-search').focus();
}

async function searchForUser(q) {
  if (q.length < 1) { document.getElementById('user-search-results').innerHTML = ''; return; }
  const users = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`).then(r => r.json());
  const list = document.getElementById('user-search-results');
  list.innerHTML = '';
  users.forEach(u => {
    const div = document.createElement('div'); div.className = 'user-result';
    div.innerHTML = `<img src="${u.avatar||'/static/img/default-avatar.png'}" onerror="this.src='/static/img/default-avatar.png'" alt=""><div><div class="user-result-name">${escHtml(u.username)}</div><div class="user-result-sub">${u.phone}</div></div>`;
    div.onclick = () => { closeModal('new-chat-modal'); openChat({ type: 'dm', id: u.id, name: u.username, avatar: u.avatar }); };
    list.appendChild(div);
  });
}

// ── Groups ─────────────────────────────────────────────────────────────────────
function openNewGroup() {
  closeModal('new-chat-modal'); selectedGroupMembers = [];
  document.getElementById('selected-members').innerHTML = '';
  document.getElementById('group-user-results').innerHTML = '';
  document.getElementById('group-step-1').classList.remove('hidden');
  document.getElementById('group-step-2').classList.add('hidden');
  document.getElementById('new-group-modal').classList.remove('hidden');
}

async function searchForGroupUser(q) {
  if (q.length < 1) { document.getElementById('group-user-results').innerHTML = ''; return; }
  const users = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`).then(r => r.json());
  const list = document.getElementById('group-user-results'); list.innerHTML = '';
  users.forEach(u => {
    if (selectedGroupMembers.find(m => m.id === u.id)) return;
    const div = document.createElement('div'); div.className = 'user-result';
    div.innerHTML = `<img src="${u.avatar||'/static/img/default-avatar.png'}" onerror="this.src='/static/img/default-avatar.png'" alt=""><div><div class="user-result-name">${escHtml(u.username)}</div><div class="user-result-sub">${u.phone}</div></div>`;
    div.onclick = () => { selectedGroupMembers.push(u); renderSelectedMembers(); div.remove(); document.getElementById('group-user-search').value = ''; document.getElementById('group-user-results').innerHTML = ''; };
    list.appendChild(div);
  });
}

function renderSelectedMembers() {
  document.getElementById('selected-members').innerHTML = selectedGroupMembers.map(m =>
    `<div class="selected-member-chip">${escHtml(m.username)}<button onclick="removeGroupMember(${m.id})">✕</button></div>`
  ).join('');
}

function removeGroupMember(id) { selectedGroupMembers = selectedGroupMembers.filter(m => m.id !== id); renderSelectedMembers(); }

function goGroupStep2() {
  if (!selectedGroupMembers.length) { toast('Add at least one member'); return; }
  document.getElementById('group-step-1').classList.add('hidden');
  document.getElementById('group-step-2').classList.remove('hidden');
}

async function createGroup() {
  const name = document.getElementById('group-name-input').value.trim();
  if (!name) { toast('Enter a group name'); return; }
  const desc = document.getElementById('group-desc-input').value.trim();
  const res = await fetch('/api/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description: desc, members: selectedGroupMembers.map(m => m.id) }) }).then(r => r.json());
  if (res.success) {
    closeModal('new-group-modal'); loadChats();
    openChat({ type: 'group', id: res.group.id, name, avatar: '' });
    toast('Group created!');
  }
}

// ── Status ─────────────────────────────────────────────────────────────────────
async function loadStatusPanel() {
  const data = await fetch('/api/statuses').then(r => r.json());
  document.getElementById('my-statuses-list').innerHTML = data.mine.length ? data.mine.map(s => buildStatusItem(s, true)).join('') : '';
  document.getElementById('contact-statuses-list').innerHTML = data.others.map(s => buildStatusItem(s, false)).join('');
  if (!data.others.length) document.getElementById('status-recent-label').textContent = 'No recent updates';
  statusList = [...data.mine.map(s => ({...s, isMe: true})), ...data.others];
}

function buildStatusItem(s, isMe) {
  const seen = s.viewed || isMe;
  return `<div class="status-item" onclick="openStatusViewer('${s.user_id}',${isMe})">
    <div class="status-avatar-ring ${seen ? 'seen' : ''}">
      <img src="${s.avatar||'/static/img/default-avatar.png'}" alt="" onerror="this.src='/static/img/default-avatar.png'">
    </div>
    <div class="status-item-info">
      <div class="status-name">${isMe ? 'My Status' : escHtml(s.username)}</div>
      <div class="status-time">${formatTime(s.timestamp)}</div>
    </div>
  </div>`;
}

function openAddStatus() {
  document.getElementById('add-status-modal').classList.remove('hidden');
}

function setStatusBg(color) {
  statusBgColor = color;
  document.getElementById('text-status-preview').style.background = color;
}

function switchStatusType(type, btn) {
  document.querySelectorAll('.status-type-tabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('text-status-form').style.display = type === 'text' ? '' : 'none';
  document.getElementById('photo-status-form').style.display = type === 'photo' ? '' : 'none';
}

function updateStatusPreview() {
  const t = document.getElementById('status-text-input').value;
  document.getElementById('text-status-preview').style.background = statusBgColor;
}

async function handleStatusMedia(e) {
  const file = e.target.files[0]; if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: fd }).then(r => r.json());
  if (res.url) { statusMediaUrl = res.url; document.getElementById('status-media-preview').src = res.url; document.getElementById('status-media-preview').style.display = 'block'; }
}

async function postStatus() {
  const content = document.getElementById('status-text-input').value || document.getElementById('status-caption').value;
  const type = statusMediaUrl ? 'image' : 'text';
  await fetch('/api/statuses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, media_url: statusMediaUrl, media_type: type, bg_color: statusBgColor }) });
  closeModal('add-status-modal'); loadStatusPanel(); toast('Status posted!');
  statusMediaUrl = '';
}

function openStatusViewer(userId, isMe) {
  const userStatuses = statusList.filter(s => s.user_id == userId);
  if (!userStatuses.length) return;
  currentStatusIdx = 0;
  window._statusViewerList = userStatuses;
  window._statusViewerIsMe = isMe;
  showStatusAt(0);
  document.getElementById('status-viewer').classList.remove('hidden');
}

function showStatusAt(idx) {
  const statuses = window._statusViewerList;
  if (!statuses || idx >= statuses.length) { closeStatusViewer(); return; }
  const s = statuses[idx];
  document.getElementById('sv-avatar').src = s.avatar || '/static/img/default-avatar.png';
  document.getElementById('sv-name').textContent = window._statusViewerIsMe ? 'My Status' : s.username;
  document.getElementById('sv-time').textContent = formatTime(s.timestamp);
  document.getElementById('sv-delete-btn').style.display = window._statusViewerIsMe ? '' : 'none';
  document.getElementById('sv-viewers').querySelector('span').textContent = s.viewers?.length || 0;

  const area = document.getElementById('status-content-area');
  if (s.media_type === 'image') {
    area.innerHTML = `<img src="${s.media_url}" style="max-width:100%;max-height:80vh;object-fit:contain">`;
  } else if (s.media_type === 'video') {
    area.innerHTML = `<video src="${s.media_url}" autoplay loop style="max-width:100%;max-height:80vh"></video>`;
  } else {
    area.innerHTML = `<div style="color:#fff;font-size:24px;text-align:center;padding:32px;background:${s.bg_color||'#075E54'};width:100%;min-height:200px;display:flex;align-items:center;justify-content:center">${escHtml(s.content)}</div>`;
  }

  // Progress
  const prog = document.getElementById('status-progress');
  prog.innerHTML = statuses.map((_, i) =>
    `<div class="status-progress-bar"><div class="fill" style="width:${i < idx ? '100%' : i === idx ? '0%' : '0%'}"></div></div>`
  ).join('');

  // Mark as viewed
  if (!window._statusViewerIsMe) fetch(`/api/statuses/${s.id}/view`, { method: 'POST' });

  // Auto-advance after 5s
  clearTimeout(window._statusTimer);
  const fill = prog.children[idx]?.querySelector('.fill');
  if (fill) { fill.style.transition = 'width 5s linear'; setTimeout(() => fill.style.width = '100%', 50); }
  window._statusTimer = setTimeout(() => nextStatus(), 5100);
}

function nextStatus() { const list = window._statusViewerList; if (!list) return; currentStatusIdx++; if (currentStatusIdx >= list.length) closeStatusViewer(); else showStatusAt(currentStatusIdx); }
function prevStatus() { const list = window._statusViewerList; if (!list) return; currentStatusIdx = Math.max(0, currentStatusIdx - 1); showStatusAt(currentStatusIdx); }
function closeStatusViewer() { document.getElementById('status-viewer').classList.add('hidden'); clearTimeout(window._statusTimer); }
async function deleteCurrentStatus() { const s = window._statusViewerList?.[currentStatusIdx]; if (s) { await fetch(`/api/statuses/${s.id}`, { method: 'DELETE' }); closeStatusViewer(); loadStatusPanel(); } }
function showStatusViewers() { const s = window._statusViewerList?.[currentStatusIdx]; if (!s) return; toast(`Viewed by: ${s.viewers.map(v=>v.name).join(', ') || 'No viewers yet'}`); }

// ── Calls — delegated to calls.js CallUI ──────────────────────
async function loadCalls() {
  const calls = await fetch('/api/calls').then(r => r.json());
  const list = document.getElementById('calls-list');
  list.innerHTML = calls.map(c => {
    const isIncoming = c.is_incoming;
    const icon = c.type === 'video' ? '📹' : '📞';
    const statusColor = c.status === 'missed' ? '#f44336' : '#25D366';
    const statusIcon = c.status === 'missed' ? '↘' : isIncoming ? '↙' : '↗';
    const other = isIncoming ? c.caller_name : c.receiver_name;
    const otherAvatar = isIncoming ? c.caller_avatar : c.receiver_avatar;
    const otherId = isIncoming ? c.caller_id : c.receiver_id;
    return `<div class="call-item" onclick="openChat({type:'dm',id:${otherId},name:'${escHtml(other)}',avatar:'${otherAvatar||''}'})">
      <img class="call-item-avatar" src="${otherAvatar||'/static/img/default-avatar.png'}" alt="" onerror="this.src='/static/img/default-avatar.png'">
      <div style="flex:1">
        <div class="call-item-name">${escHtml(other)}</div>
        <div class="call-item-info" style="color:${statusColor}">${statusIcon} ${c.type} · ${formatTime(c.timestamp)}${c.duration ? ` · ${formatDuration(c.duration)}` : ''}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="icon-btn" onclick="event.stopPropagation();if(typeof CallUI!=='undefined')CallUI.startCall(${otherId},'${escHtml(other)}','${otherAvatar||''}','voice')" title="Voice call">
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.67-.36 1-.24 1.1.4 2.3.6 3.6.6.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02L6.6 10.8z" fill="currentColor"/></svg>
        </button>
        <button class="icon-btn" onclick="event.stopPropagation();if(typeof CallUI!=='undefined')CallUI.startCall(${otherId},'${escHtml(other)}','${otherAvatar||''}','video')" title="Video call">
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" fill="currentColor"/></svg>
        </button>
      </div>
    </div>`;
  }).join('') || '<div style="padding:32px;text-align:center;color:#667781">No recent calls</div>';
}

function openNewCall() {
  if (currentChat?.type === 'dm' && typeof CallUI !== 'undefined') CallUI.startCall(currentChat.id, currentChat.name, currentChat.avatar, 'voice');
  else toast('Open a chat to call');
}

// Legacy stubs (no-ops — real logic in calls.js)
function hideCallOverlays() {}
function cleanupCall() {}

// ── Settings ───────────────────────────────────────────────────────────────────
function openSettings() { document.getElementById('settings-modal').classList.remove('hidden'); closeAllDropdowns(); }

async function toggleTheme() {
  const newTheme = me.theme === 'dark' ? 'light' : 'dark';
  me.theme = newTheme; applyTheme(newTheme);
  await fetch('/api/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: newTheme }) });
  document.getElementById('settings-theme-sub').textContent = newTheme === 'dark' ? 'Dark' : 'Light';
}

function openPrivacySettings() {
  setPrivacyToggles();
  document.getElementById('privacy-modal').classList.remove('hidden');
}

function setPrivacyToggles() {
  document.getElementById('pref-last-seen').checked = me.show_last_seen !== false;
  document.getElementById('pref-profile-photo').checked = me.show_profile_photo !== false;
  document.getElementById('pref-about').checked = me.show_about !== false;
  document.getElementById('pref-read-receipts').checked = me.read_receipts !== false;
}

async function updatePref(key, val) {
  me[key] = val;
  await fetch('/api/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: val }) });
}

function openNotifSettings() { toast('Notifications: ' + (me.notifications ? 'On' : 'Off')); }

function openChangePassword() {
  document.getElementById('change-pw-modal').classList.remove('hidden');
  document.getElementById('change-pw-modal').classList.add('center');
}

async function doChangePassword() {
  const c = document.getElementById('curr-pw').value, n = document.getElementById('new-pw').value, cf = document.getElementById('confirm-pw').value;
  if (n !== cf) { toast('Passwords do not match'); return; }
  const r = await fetch('/api/me/password', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current_password: c, new_password: n }) }).then(r => r.json());
  if (r.success) { toast('Password updated'); closeModal('change-pw-modal'); } else toast(r.error);
}

async function openBlockedList() {
  const blocked = await fetch('/api/blocked').then(r => r.json());
  document.getElementById('blocked-list').innerHTML = blocked.map(u =>
    `<div class="user-result"><img src="${u.avatar||'/static/img/default-avatar.png'}" onerror="this.src='/static/img/default-avatar.png'" alt=""><div style="flex:1"><div class="user-result-name">${escHtml(u.username)}</div></div><button onclick="unblockUser(${u.id})">Unblock</button></div>`
  ).join('') || '<div style="padding:20px;text-align:center;color:#667781">No blocked contacts</div>';
  document.getElementById('blocked-modal').classList.remove('hidden');
}

async function unblockUser(uid) { await fetch(`/api/block/${uid}`, { method: 'DELETE' }); openBlockedList(); toast('Unblocked'); }
function blockUserFromInfo() { if (!currentChat) return; fetch(`/api/block/${currentChat.id}`, { method: 'POST' }); closeModal('contact-info-modal'); toast('Blocked'); }
function reportUserFromInfo() { toast('Report sent to support team'); closeModal('contact-info-modal'); }

async function openStarred() {
  const msgs = await fetch('/api/starred').then(r => r.json());
  const list = document.getElementById('starred-list');
  list.innerHTML = msgs.map(m =>
    `<div class="chat-item" style="border-bottom:1px solid var(--border)">
      <div style="flex:1"><div style="font-size:12px;color:#667781">⭐ ${escHtml(m.sender_name)}</div><div style="font-size:15px;margin-top:2px">${escHtml(m.content) || `[${m.type}]`}</div></div>
      <div style="font-size:11px;color:#667781">${formatTime(m.timestamp)}</div>
    </div>`
  ).join('') || '<div style="padding:20px;text-align:center;color:#667781">No starred messages</div>';
  closeModal('settings-modal');
  document.getElementById('starred-modal').classList.remove('hidden');
}

function exportChatData() {
  if (!currentChat) { toast('Open a chat first to export'); return; }
  const msgs = document.querySelectorAll('.msg-text');
  let text = `Chat Export - ${currentChat.name}\n${'='.repeat(40)}\n\n`;
  document.querySelectorAll('.msg-wrapper').forEach(w => {
    const time = w.querySelector('.msg-time')?.textContent || '';
    const txt = w.querySelector('.msg-text')?.textContent || '[media]';
    const dir = w.classList.contains('out') ? 'You' : currentChat.name;
    text += `[${time}] ${dir}: ${txt}\n`;
  });
  const a = document.createElement('a'); a.href = 'data:text/plain,' + encodeURIComponent(text);
  a.download = `chat_${currentChat.name}_${new Date().toISOString().split('T')[0]}.txt`;
  a.click(); toast('Chat exported!');
}

// ── Chat actions ───────────────────────────────────────────────────────────────
async function muteChat() {
  if (!currentChat) return;
  await fetch('/api/chats/mute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: currentChat.type, id: currentChat.id }) });
  toast('Chat muted'); loadChats(); closeAllDropdowns();
}

async function blockUser() {
  if (!currentChat || currentChat.type !== 'dm') return;
  await fetch(`/api/block/${currentChat.id}`, { method: 'POST' });
  toast('User blocked'); closeAllDropdowns();
}

function reportUser() { toast('Report submitted'); closeAllDropdowns(); }

function clearChatHistory() {
  if (!confirm('Clear all messages? (Only for you)')) return;
  document.getElementById('messages-container').innerHTML = '';
  closeAllDropdowns(); toast('Chat cleared');
}

function deleteChat() {
  closeChat(); loadChats(); closeAllDropdowns(); toast('Chat deleted');
}

function selectMessages() { toast('Long-press messages to select them'); closeAllDropdowns(); }

function showChatItemMenu(e, c) {
  const menu = prompt(`Chat: ${c.name}\nType: a=Archive, m=Mute, d=Delete`, 'a');
  if (menu === 'a') archiveChat(c);
  if (menu === 'm') { fetch('/api/chats/mute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: c.type, id: c.id }) }).then(() => { loadChats(); toast('Muted'); }); }
}

async function archiveChat(c) {
  await fetch('/api/chats/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: c.type, id: c.id }) });
  loadChats(); toast('Chat archived');
}

// ── Filter / Search ────────────────────────────────────────────────────────────
function filterChats(q) {
  const clear = document.getElementById('search-clear');
  clear.style.display = q ? '' : 'none';
  if (!q) { renderChatList(allChats); return; }
  const filtered = allChats.filter(c => c.name.toLowerCase().includes(q.toLowerCase()));
  renderChatList(filtered);
}

function clearSearch() { document.getElementById('search-input').value = ''; filterChats(''); }

// ── Tab Switching ──────────────────────────────────────────────────────────────
function switchTab(tab) {
  ['chats', 'status', 'calls'].forEach(t => {
    document.getElementById(`tab-${t}`)?.classList.toggle('active', t === tab);
    document.getElementById(`${t}-panel`) && document.getElementById(`${t}-panel`).classList.toggle('hidden', t !== tab);
  });
  // Chat list visibility
  document.getElementById('chat-list-panel').classList.toggle('hidden', tab !== 'chats');
  if (tab === 'status') loadStatusPanel();
  if (tab === 'calls') loadCalls();
}

// ── Lightbox ───────────────────────────────────────────────────────────────────
function openLightbox(url, type) {
  const lb = document.createElement('div'); lb.className = 'lightbox';
  lb.innerHTML = `<button class="lightbox-close" onclick="this.parentNode.remove()">✕</button>
    ${type === 'video' ? `<video src="${url}" controls autoplay style="max-width:90vw;max-height:90vh">` : `<img src="${url}" alt="">`}`;
  lb.onclick = e => { if (e.target === lb) lb.remove(); };
  document.body.appendChild(lb);
}

// ── Toast ──────────────────────────────────────────────────────────────────────
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3000);
}

// ── Scroll ─────────────────────────────────────────────────────────────────────
function scrollToBottom(instant = false) {
  const area = document.getElementById('messages-area');
  area.scrollTo({ top: area.scrollHeight, behavior: instant ? 'auto' : 'smooth' });
}

function onMessagesScroll() {
  const area = document.getElementById('messages-area');
  if (area.scrollTop < 50 && hasMore) loadMoreMessages();
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function closeAllDropdowns() {
  document.querySelectorAll('.dropdown-menu, .context-menu, .reaction-picker, .attachment-menu, .emoji-picker').forEach(el => el.classList.add('hidden'));
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function openContactShare() { toast('Contact sharing: Tap a contact name to share'); }

function toggleSidebarMenu() { document.getElementById('sidebar-menu').classList.toggle('hidden'); }
function toggleChatMenu() { document.getElementById('chat-menu').classList.toggle('hidden'); }

async function logout() { await fetch('/logout'); window.location = '/login'; }

function escHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML; }

function formatTime(iso) {
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z'); const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const diff = (now - d) / 86400000;
  if (diff < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function formatLastSeen(iso) {
  if (!iso) return 'a while ago';
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z'); const now = new Date();
  if (now - d < 60000) return 'just now';
  if (now - d < 3600000) return Math.floor((now - d) / 60000) + ' min ago';
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { weekday: 'long', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(s) { return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}

function stringToColor(s) {
  if (!s) return '#128C7E';
  let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 360; return `hsl(${hue},60%,40%)`;
}

function updateChatItemLastMsg(msg) {
  loadChats(); // Refresh for simplicity
}

function showNotification(msg) {
  if (Notification.permission === 'granted') {
    new Notification(msg.sender_name || 'WhatsApp', { body: msg.content || `[${msg.type}]`, icon: '/static/img/default-avatar.png' });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission();
  }
}

// ── Global click handler ───────────────────────────────────────────────────────
document.addEventListener('click', e => {
  if (!e.target.closest('.dropdown-menu, .icon-btn, .sidebar-header, .chat-header-actions')) {
    document.querySelectorAll('.dropdown-menu').forEach(el => el.classList.add('hidden'));
  }
  if (!e.target.closest('.context-menu, .msg-bubble, .msg-actions')) {
    document.getElementById('context-menu').classList.add('hidden');
  }
  if (!e.target.closest('.reaction-picker, .msg-actions')) {
    document.getElementById('reaction-picker').classList.add('hidden');
  }
  if (!e.target.closest('.attachment-menu, .icon-btn')) {
    document.getElementById('attachment-menu').classList.add('hidden');
  }
  if (!e.target.closest('.emoji-picker, .emoji-btn')) {
    document.getElementById('emoji-picker').classList.add('hidden');
  }
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.add('hidden');
  }
});

// Request notification permission
if (Notification.permission !== 'denied') Notification.requestPermission();

// ── Start ──────────────────────────────────────────────────────────────────────
init();
