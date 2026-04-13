# 📱 WhatsApp Clone — Full Stack Python

A production-grade WhatsApp web clone built with **Flask + SocketIO + SQLite**.

---

## 🚀 How to Run (3 Easy Steps)

### Step 1 — Make sure Python is installed
```bash
python --version   # Should be 3.8+
```

### Step 2 — Install dependencies
```bash
cd whatsapp-clone
pip install -r requirements.txt
```

### Step 3 — Start the server
```bash
python app.py
```

Then open **http://localhost:5000** in your browser.

---

## 👤 Demo Accounts (pre-created)

| Username  | Password   |
|-----------|------------|
| alice     | password   |
| bob       | password   |
| charlie   | password   |

> Open two browser tabs (or two different browsers) and log in as different users to test real-time messaging!

---

## ✅ Features Included

### 💬 Messaging
- ✅ Real-time messaging (WebSocket / SocketIO)
- ✅ Text messages with emoji support
- ✅ Image, video, audio, document sending
- ✅ Voice messages (record & play)
- ✅ Location sharing
- ✅ Reply to any message
- ✅ Forward messages to any chat
- ✅ Edit sent messages
- ✅ Delete for everyone / delete for me
- ✅ Message reactions (👍 ❤️ 😂 😮 😢 🙏)
- ✅ Star/Unstar messages
- ✅ Pin messages
- ✅ Message read receipts (blue ticks)
- ✅ Typing indicator
- ✅ In-chat message search

### 👥 Groups
- ✅ Create group with name & description
- ✅ Group avatar upload
- ✅ Add / remove members
- ✅ Make / remove admins
- ✅ Invite link
- ✅ Only admins can message (setting)
- ✅ Group info panel

### 📸 Status (Stories)
- ✅ Post text status with background color
- ✅ Post photo / video status
- ✅ 24-hour auto-expiry
- ✅ Status viewer with progress bar
- ✅ View count & viewer list
- ✅ Delete your own status

### 📞 Calls
- ✅ Voice call (WebRTC)
- ✅ Video call (WebRTC)
- ✅ Call history (missed / answered / declined)
- ✅ Mute / speaker / toggle video
- ✅ Call timer

### 👤 Profile & Settings
- ✅ Edit username, about, email
- ✅ Profile avatar upload & crop
- ✅ Privacy settings (last seen, profile photo, about, read receipts)
- ✅ Dark / Light theme
- ✅ Change password
- ✅ Block / Unblock contacts
- ✅ Starred messages page
- ✅ Export chat to .txt file

### 🔒 Privacy & Security
- ✅ Bcrypt password hashing
- ✅ Flask-Login session management
- ✅ Block users
- ✅ Privacy controls for last seen, profile photo, read receipts

### 📋 Chat Management
- ✅ Archive chats
- ✅ Mute chats
- ✅ Pinned messages bar
- ✅ Search contacts / users
- ✅ Online / offline status indicator
- ✅ Last seen display
- ✅ Unread message badges
- ✅ Chat list with last message preview
- ✅ Load older messages (pagination)

### 📱 UI/UX
- ✅ WhatsApp-identical design
- ✅ Dark mode / Light mode
- ✅ Mobile responsive
- ✅ Emoji picker (200+ emojis)
- ✅ Image lightbox viewer
- ✅ Context menu on messages
- ✅ Toast notifications
- ✅ Browser push notifications

---

## 🗂️ Project Structure

```
whatsapp-clone/
├── app.py              ← Main Flask server (models + API + SocketIO)
├── run.py              ← Easy starter script
├── requirements.txt    ← Python dependencies
├── templates/
│   ├── login.html      ← Login / Register page
│   └── chat.html       ← Main chat UI
└── static/
    ├── css/
    │   └── chat.css    ← Full WhatsApp-style CSS
    ├── js/
    │   └── chat.js     ← All frontend logic
    ├── img/
    │   └── default-avatar.png
    └── uploads/        ← User uploaded files (auto-created)
```

---

## 🛠️ Tech Stack

| Layer      | Technology                   |
|------------|------------------------------|
| Backend    | Python 3 + Flask             |
| Realtime   | Flask-SocketIO + EventLet    |
| Database   | SQLite (via Flask-SQLAlchemy)|
| Auth       | Flask-Login + Bcrypt         |
| Frontend   | Vanilla HTML/CSS/JS          |
| Calls      | WebRTC                       |
| Uploads    | Pillow (image processing)    |

---

## 💡 Tips

- **Multiple users**: Open two different browsers (Chrome + Firefox) or use private/incognito mode
- **Mobile**: Access via your phone on the same WiFi using `http://YOUR_PC_IP:5000`
- **Production**: Replace SQLite with PostgreSQL and set `SECRET_KEY` in `.env`
- **HTTPS for calls**: WebRTC requires HTTPS in production. Use a reverse proxy like Nginx + Let's Encrypt

---

## 🔧 Environment Variables (optional)

Create a `.env` file:
```
SECRET_KEY=your-super-secret-key-here
```

---

## 📦 Dependencies

```
flask==3.0.3
flask-socketio==5.3.6
flask-sqlalchemy==3.1.1
flask-login==0.6.3
flask-bcrypt==1.0.1
flask-cors==4.0.1
python-socketio==5.11.2
pillow==10.4.0
python-dotenv==1.0.1
eventlet==0.36.1
```

---

Made with ❤️ — Full stack WhatsApp Clone
