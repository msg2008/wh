
import os, json, time, uuid
from datetime import datetime, timezone
from flask import Flask, render_template, request, jsonify, send_from_directory, redirect, url_for, session
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from flask_bcrypt import Bcrypt
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
from werkzeug.utils import secure_filename
from PIL import Image
import io

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'whatsapp-clone-secret-key-2024')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///whatsapp.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 64 * 1024 * 1024  # 64MB max upload

ALLOWED_EXTENSIONS = {'png','jpg','jpeg','gif','webp','mp4','mov','avi','mp3','wav','ogg','pdf','doc','docx','xls','xlsx','zip','txt'}

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# ─── MODELS ────────────────────────────────────────────────────────────────────

group_members = db.Table('group_members',
    db.Column('user_id', db.Integer, db.ForeignKey('user.id')),
    db.Column('group_id', db.Integer, db.ForeignKey('group.id'))
)

group_admins = db.Table('group_admins',
    db.Column('user_id', db.Integer, db.ForeignKey('user.id')),
    db.Column('group_id', db.Integer, db.ForeignKey('group.id'))
)

contacts = db.Table('contacts',
    db.Column('user_id', db.Integer, db.ForeignKey('user.id')),
    db.Column('contact_id', db.Integer, db.ForeignKey('user.id'))
)

blocked_users = db.Table('blocked_users',
    db.Column('user_id', db.Integer, db.ForeignKey('user.id')),
    db.Column('blocked_id', db.Integer, db.ForeignKey('user.id'))
)

class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    phone = db.Column(db.String(20), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True)
    password_hash = db.Column(db.String(200), nullable=False)
    about = db.Column(db.String(200), default="Hey there! I am using WhatsApp.")
    avatar = db.Column(db.String(200), default='')
    is_online = db.Column(db.Boolean, default=False)
    last_seen = db.Column(db.DateTime, default=datetime.utcnow)
    show_last_seen = db.Column(db.Boolean, default=True)
    show_profile_photo = db.Column(db.Boolean, default=True)
    show_about = db.Column(db.Boolean, default=True)
    read_receipts = db.Column(db.Boolean, default=True)
    notifications = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    two_factor = db.Column(db.Boolean, default=False)
    theme = db.Column(db.String(20), default='light')
    wallpaper = db.Column(db.String(200), default='')
    font_size = db.Column(db.String(10), default='medium')
    contacts_rel = db.relationship('User', secondary=contacts,
        primaryjoin=(contacts.c.user_id == id),
        secondaryjoin=(contacts.c.contact_id == id),
        backref='added_by')
    blocked_rel = db.relationship('User', secondary=blocked_users,
        primaryjoin=(blocked_users.c.user_id == id),
        secondaryjoin=(blocked_users.c.blocked_id == id))

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    receiver_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    group_id = db.Column(db.Integer, db.ForeignKey('group.id'), nullable=True)
    content = db.Column(db.Text, default='')
    msg_type = db.Column(db.String(20), default='text')  # text,image,video,audio,file,voice,sticker,location,contact
    file_url = db.Column(db.String(300), default='')
    file_name = db.Column(db.String(200), default='')
    file_size = db.Column(db.Integer, default=0)
    reply_to_id = db.Column(db.Integer, db.ForeignKey('message.id'), nullable=True)
    forwarded_from_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    is_deleted = db.Column(db.Boolean, default=False)
    deleted_for_everyone = db.Column(db.Boolean, default=False)
    is_edited = db.Column(db.Boolean, default=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    edited_at = db.Column(db.DateTime, nullable=True)
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    duration = db.Column(db.Integer, default=0)  # for audio/video
    thumbnail = db.Column(db.String(300), default='')
    sender = db.relationship('User', foreign_keys=[sender_id])
    reply_to = db.relationship('Message', remote_side=[id], foreign_keys=[reply_to_id])
    reactions = db.relationship('Reaction', backref='message', cascade='all, delete-orphan')
    read_by = db.relationship('MessageRead', backref='message', cascade='all, delete-orphan')

class MessageRead(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.Integer, db.ForeignKey('message.id'))
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    read_at = db.Column(db.DateTime, default=datetime.utcnow)

class Reaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.Integer, db.ForeignKey('message.id'))
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    emoji = db.Column(db.String(10))
    user = db.relationship('User')

class Group(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(300), default='')
    avatar = db.Column(db.String(200), default='')
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    invite_link = db.Column(db.String(100), default='', unique=True)
    only_admins_message = db.Column(db.Boolean, default=False)
    members = db.relationship('User', secondary=group_members, backref='groups')
    admins = db.relationship('User', secondary=group_admins, backref='admin_groups')
    messages = db.relationship('Message', backref='group', foreign_keys=[Message.group_id])

class Status(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    content = db.Column(db.Text, default='')
    media_url = db.Column(db.String(300), default='')
    media_type = db.Column(db.String(20), default='text')  # text,image,video
    bg_color = db.Column(db.String(20), default='#075E54')
    font_style = db.Column(db.String(20), default='normal')
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime)
    viewers = db.relationship('StatusView', backref='status', cascade='all, delete-orphan')
    user = db.relationship('User')

class StatusView(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    status_id = db.Column(db.Integer, db.ForeignKey('status.id'))
    viewer_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    viewed_at = db.Column(db.DateTime, default=datetime.utcnow)
    viewer = db.relationship('User')

class Call(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    caller_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    receiver_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    call_type = db.Column(db.String(10), default='voice')  # voice, video
    status = db.Column(db.String(20), default='missed')  # missed, answered, declined
    duration = db.Column(db.Integer, default=0)  # seconds
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    caller = db.relationship('User', foreign_keys=[caller_id])
    receiver = db.relationship('User', foreign_keys=[receiver_id])

class StarredMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    message_id = db.Column(db.Integer, db.ForeignKey('message.id'))
    starred_at = db.Column(db.DateTime, default=datetime.utcnow)
    message = db.relationship('Message')

class PinnedMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    chat_type = db.Column(db.String(10))  # dm, group
    chat_id = db.Column(db.Integer)
    message_id = db.Column(db.Integer, db.ForeignKey('message.id'))
    pinned_by = db.Column(db.Integer, db.ForeignKey('user.id'))
    pinned_at = db.Column(db.DateTime, default=datetime.utcnow)
    message = db.relationship('Message')

class ArchivedChat(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    chat_type = db.Column(db.String(10))
    chat_id = db.Column(db.Integer)

class MutedChat(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    chat_type = db.Column(db.String(10))
    chat_id = db.Column(db.Integer)
    until = db.Column(db.DateTime, nullable=True)

class Announcement(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('group.id'))
    content = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# ─── HELPERS ───────────────────────────────────────────────────────────────────

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_file_type(filename):
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    if ext in {'png','jpg','jpeg','gif','webp'}: return 'image'
    if ext in {'mp4','mov','avi','webm'}: return 'video'
    if ext in {'mp3','wav','ogg','m4a'}: return 'audio'
    return 'file'

def msg_to_dict(m, viewer_id=None):
    reactions_map = {}
    for r in m.reactions:
        reactions_map.setdefault(r.emoji, []).append({'id': r.user_id, 'name': r.user.username})
    read_by = [rb.user_id for rb in m.read_by]
    is_starred = bool(StarredMessage.query.filter_by(user_id=viewer_id, message_id=m.id).first()) if viewer_id else False
    reply_data = None
    if m.reply_to:
        reply_data = {'id': m.reply_to.id, 'content': m.reply_to.content if not m.reply_to.is_deleted else 'This message was deleted',
                      'sender': m.reply_to.sender.username if m.reply_to.sender else '', 'type': m.reply_to.msg_type,
                      'file_url': m.reply_to.file_url}
    return {
        'id': m.id, 'sender_id': m.sender_id, 'receiver_id': m.receiver_id,
        'group_id': m.group_id, 'content': m.content if not m.deleted_for_everyone else '',
        'type': m.msg_type, 'file_url': m.file_url, 'file_name': m.file_name,
        'file_size': m.file_size, 'thumbnail': m.thumbnail, 'duration': m.duration,
        'latitude': m.latitude, 'longitude': m.longitude,
        'timestamp': m.timestamp.isoformat() + 'Z', 'is_deleted': m.is_deleted,
        'deleted_for_everyone': m.deleted_for_everyone, 'is_edited': m.is_edited,
        'edited_at': m.edited_at.isoformat() + 'Z' if m.edited_at else None,
        'sender_name': m.sender.username if m.sender else '',
        'sender_avatar': m.sender.avatar if m.sender else '',
        'reactions': reactions_map, 'read_by': read_by, 'reply_to': reply_data,
        'is_starred': is_starred
    }

def user_to_dict(u):
    return {'id': u.id, 'username': u.username, 'phone': u.phone, 'email': u.email or '',
            'about': u.about, 'avatar': u.avatar, 'is_online': u.is_online,
            'last_seen': u.last_seen.isoformat() + 'Z', 'show_last_seen': u.show_last_seen,
            'show_profile_photo': u.show_profile_photo, 'read_receipts': u.read_receipts}

# ─── AUTH ROUTES ──────────────────────────────────────────────────────────────

@app.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('chat'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('chat'))
    if request.method == 'POST':
        data = request.get_json()
        identifier = data.get('identifier', '')
        password = data.get('password', '')
        user = User.query.filter(
            (User.phone == identifier) | (User.email == identifier) | (User.username == identifier)
        ).first()
        if user and bcrypt.check_password_hash(user.password_hash, password):
            login_user(user, remember=data.get('remember', False))
            user.is_online = True
            user.last_seen = datetime.utcnow()
            db.session.commit()
            return jsonify({'success': True, 'user': user_to_dict(user)})
        return jsonify({'success': False, 'error': 'Invalid credentials'}), 401
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        data = request.get_json()
        if User.query.filter_by(phone=data['phone']).first():
            return jsonify({'success': False, 'error': 'Phone number already registered'}), 400
        if User.query.filter_by(username=data['username']).first():
            return jsonify({'success': False, 'error': 'Username already taken'}), 400
        user = User(
            username=data['username'], phone=data['phone'],
            email=data.get('email', ''),
            password_hash=bcrypt.generate_password_hash(data['password']).decode('utf-8')
        )
        db.session.add(user)
        db.session.commit()
        login_user(user)
        return jsonify({'success': True, 'user': user_to_dict(user)})
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    current_user.is_online = False
    current_user.last_seen = datetime.utcnow()
    db.session.commit()
    logout_user()
    return redirect(url_for('login'))

@app.route('/chat')
@login_required
def chat():
    return render_template('chat.html')

# ─── USER API ─────────────────────────────────────────────────────────────────

@app.route('/api/me')
@login_required
def get_me():
    return jsonify(user_to_dict(current_user))

@app.route('/api/me', methods=['PUT'])
@login_required
def update_me():
    data = request.get_json()
    for field in ['username', 'about', 'show_last_seen', 'show_profile_photo', 'show_about',
                  'read_receipts', 'notifications', 'theme', 'font_size']:
        if field in data:
            setattr(current_user, field, data[field])
    if 'email' in data:
        current_user.email = data['email']
    db.session.commit()
    socketio.emit('user_updated', user_to_dict(current_user), room=f"user_{current_user.id}")
    return jsonify({'success': True, 'user': user_to_dict(current_user)})

@app.route('/api/me/password', methods=['PUT'])
@login_required
def change_password():
    data = request.get_json()
    if not bcrypt.check_password_hash(current_user.password_hash, data['current_password']):
        return jsonify({'success': False, 'error': 'Wrong current password'}), 400
    current_user.password_hash = bcrypt.generate_password_hash(data['new_password']).decode('utf-8')
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/users/search')
@login_required
def search_users():
    q = request.args.get('q', '')
    users = User.query.filter(
        (User.username.ilike(f'%{q}%') | User.phone.ilike(f'%{q}%')),
        User.id != current_user.id
    ).limit(20).all()
    return jsonify([user_to_dict(u) for u in users])

@app.route('/api/users/<int:uid>')
@login_required
def get_user(uid):
    u = User.query.get_or_404(uid)
    return jsonify(user_to_dict(u))

@app.route('/api/contacts')
@login_required
def get_contacts():
    return jsonify([user_to_dict(u) for u in current_user.contacts_rel])

@app.route('/api/contacts', methods=['POST'])
@login_required
def add_contact():
    data = request.get_json()
    user = User.query.filter_by(phone=data.get('phone', '')).first()
    if not user:
        user = User.query.filter_by(username=data.get('username', '')).first()
    if not user:
        return jsonify({'success': False, 'error': 'User not found'}), 404
    if user not in current_user.contacts_rel:
        current_user.contacts_rel.append(user)
        db.session.commit()
    return jsonify({'success': True, 'user': user_to_dict(user)})

@app.route('/api/contacts/<int:uid>', methods=['DELETE'])
@login_required
def remove_contact(uid):
    user = User.query.get_or_404(uid)
    if user in current_user.contacts_rel:
        current_user.contacts_rel.remove(user)
        db.session.commit()
    return jsonify({'success': True})

@app.route('/api/block/<int:uid>', methods=['POST'])
@login_required
def block_user(uid):
    user = User.query.get_or_404(uid)
    if user not in current_user.blocked_rel:
        current_user.blocked_rel.append(user)
        db.session.commit()
    return jsonify({'success': True})

@app.route('/api/block/<int:uid>', methods=['DELETE'])
@login_required
def unblock_user(uid):
    user = User.query.get_or_404(uid)
    if user in current_user.blocked_rel:
        current_user.blocked_rel.remove(user)
        db.session.commit()
    return jsonify({'success': True})

@app.route('/api/blocked')
@login_required
def get_blocked():
    return jsonify([user_to_dict(u) for u in current_user.blocked_rel])

# ─── MESSAGES API ─────────────────────────────────────────────────────────────

@app.route('/api/messages/dm/<int:other_id>')
@login_required
def get_dm_messages(other_id):
    page = request.args.get('page', 1, type=int)
    per_page = 50
    msgs = Message.query.filter(
        ((Message.sender_id == current_user.id) & (Message.receiver_id == other_id)) |
        ((Message.sender_id == other_id) & (Message.receiver_id == current_user.id)),
        Message.group_id == None
    ).order_by(Message.timestamp.desc()).paginate(page=page, per_page=per_page, error_out=False)
    # Mark as read
    unread = Message.query.filter_by(sender_id=other_id, receiver_id=current_user.id).filter(
        ~Message.read_by.any(MessageRead.user_id == current_user.id)
    ).all()
    for m in unread:
        db.session.add(MessageRead(message_id=m.id, user_id=current_user.id))
    db.session.commit()
    result = [msg_to_dict(m, current_user.id) for m in reversed(msgs.items)]
    return jsonify({'messages': result, 'has_more': msgs.has_next, 'page': page})

@app.route('/api/messages/group/<int:group_id>')
@login_required
def get_group_messages(group_id):
    group = Group.query.get_or_404(group_id)
    if current_user not in group.members:
        return jsonify({'error': 'Not a member'}), 403
    page = request.args.get('page', 1, type=int)
    msgs = Message.query.filter_by(group_id=group_id).order_by(
        Message.timestamp.desc()).paginate(page=page, per_page=50, error_out=False)
    unread = Message.query.filter_by(group_id=group_id).filter(
        Message.sender_id != current_user.id,
        ~Message.read_by.any(MessageRead.user_id == current_user.id)
    ).all()
    for m in unread:
        db.session.add(MessageRead(message_id=m.id, user_id=current_user.id))
    db.session.commit()
    result = [msg_to_dict(m, current_user.id) for m in reversed(msgs.items)]
    return jsonify({'messages': result, 'has_more': msgs.has_next, 'page': page})

@app.route('/api/messages/<int:msg_id>', methods=['DELETE'])
@login_required
def delete_message(msg_id):
    m = Message.query.get_or_404(msg_id)
    if m.sender_id != current_user.id:
        return jsonify({'error': 'Unauthorized'}), 403
    delete_for = request.get_json().get('for_everyone', False)
    if delete_for:
        m.deleted_for_everyone = True
        m.content = ''
        m.file_url = ''
        db.session.commit()
        room = f"group_{m.group_id}" if m.group_id else f"dm_{min(m.sender_id, m.receiver_id)}_{max(m.sender_id, m.receiver_id)}"
        socketio.emit('message_deleted', {'id': m.id, 'for_everyone': True}, room=room)
    else:
        m.is_deleted = True
        db.session.commit()
    return jsonify({'success': True})

@app.route('/api/messages/<int:msg_id>', methods=['PUT'])
@login_required
def edit_message(msg_id):
    m = Message.query.get_or_404(msg_id)
    if m.sender_id != current_user.id:
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.get_json()
    m.content = data['content']
    m.is_edited = True
    m.edited_at = datetime.utcnow()
    db.session.commit()
    room = f"group_{m.group_id}" if m.group_id else f"dm_{min(m.sender_id, m.receiver_id)}_{max(m.sender_id, m.receiver_id)}"
    socketio.emit('message_edited', msg_to_dict(m, current_user.id), room=room)
    return jsonify({'success': True, 'message': msg_to_dict(m, current_user.id)})

@app.route('/api/messages/<int:msg_id>/react', methods=['POST'])
@login_required
def react_to_message(msg_id):
    data = request.get_json()
    emoji = data.get('emoji', '')
    existing = Reaction.query.filter_by(message_id=msg_id, user_id=current_user.id, emoji=emoji).first()
    if existing:
        db.session.delete(existing)
    else:
        old = Reaction.query.filter_by(message_id=msg_id, user_id=current_user.id).first()
        if old: db.session.delete(old)
        db.session.add(Reaction(message_id=msg_id, user_id=current_user.id, emoji=emoji))
    db.session.commit()
    m = Message.query.get(msg_id)
    room = f"group_{m.group_id}" if m.group_id else f"dm_{min(m.sender_id, m.receiver_id)}_{max(m.sender_id, m.receiver_id)}"
    socketio.emit('reaction_updated', msg_to_dict(m, current_user.id), room=room)
    return jsonify({'success': True})

@app.route('/api/messages/<int:msg_id>/star', methods=['POST'])
@login_required
def star_message(msg_id):
    existing = StarredMessage.query.filter_by(user_id=current_user.id, message_id=msg_id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({'starred': False})
    db.session.add(StarredMessage(user_id=current_user.id, message_id=msg_id))
    db.session.commit()
    return jsonify({'starred': True})

@app.route('/api/starred')
@login_required
def get_starred():
    starred = StarredMessage.query.filter_by(user_id=current_user.id).order_by(StarredMessage.starred_at.desc()).all()
    return jsonify([msg_to_dict(s.message, current_user.id) for s in starred if s.message])

@app.route('/api/messages/search')
@login_required
def search_messages():
    q = request.args.get('q', '')
    chat_type = request.args.get('type', 'dm')
    chat_id = request.args.get('chat_id', type=int)
    if chat_type == 'dm':
        msgs = Message.query.filter(
            Message.content.ilike(f'%{q}%'),
            ((Message.sender_id == current_user.id) & (Message.receiver_id == chat_id)) |
            ((Message.sender_id == chat_id) & (Message.receiver_id == current_user.id))
        ).limit(30).all()
    else:
        msgs = Message.query.filter(Message.content.ilike(f'%{q}%'), Message.group_id == chat_id).limit(30).all()
    return jsonify([msg_to_dict(m, current_user.id) for m in msgs])

# ─── FILE UPLOAD ──────────────────────────────────────────────────────────────

@app.route('/api/upload', methods=['POST'])
@login_required
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file'}), 400
    f = request.files['file']
    if not allowed_file(f.filename):
        return jsonify({'error': 'File type not allowed'}), 400
    ext = f.filename.rsplit('.', 1)[1].lower()
    fname = f"{uuid.uuid4().hex}.{ext}"
    path = os.path.join(app.config['UPLOAD_FOLDER'], fname)
    f.save(path)
    ftype = get_file_type(fname)
    thumb = ''
    if ftype == 'image':
        try:
            img = Image.open(path)
            img.thumbnail((200, 200))
            tname = f"thumb_{fname}"
            tpath = os.path.join(app.config['UPLOAD_FOLDER'], tname)
            img.save(tpath)
            thumb = f"/static/uploads/{tname}"
        except: pass
    size = os.path.getsize(path)
    return jsonify({'url': f'/static/uploads/{fname}', 'type': ftype, 'name': f.filename, 'size': size, 'thumbnail': thumb})

@app.route('/api/upload/avatar', methods=['POST'])
@login_required
def upload_avatar():
    if 'file' not in request.files:
        return jsonify({'error': 'No file'}), 400
    f = request.files['file']
    ext = f.filename.rsplit('.', 1)[1].lower() if '.' in f.filename else 'jpg'
    fname = f"avatar_{current_user.id}_{uuid.uuid4().hex[:8]}.{ext}"
    path = os.path.join(app.config['UPLOAD_FOLDER'], fname)
    try:
        img = Image.open(f)
        img = img.convert('RGB')
        img.thumbnail((400, 400))
        img.save(path)
    except:
        f.seek(0)
        f.save(path)
    current_user.avatar = f"/static/uploads/{fname}"
    db.session.commit()
    socketio.emit('user_updated', user_to_dict(current_user), broadcast=True)
    return jsonify({'url': current_user.avatar})

# ─── CHATS / CONVERSATIONS ────────────────────────────────────────────────────

@app.route('/api/chats')
@login_required
def get_chats():
    # Get all DM conversations
    dm_partners = db.session.query(
        db.func.coalesce(Message.receiver_id, Message.sender_id)
    ).filter(
        (Message.sender_id == current_user.id) | (Message.receiver_id == current_user.id),
        Message.group_id == None
    ).distinct().all()
    
    chats = []
    seen_partners = set()
    
    msgs_with_others = Message.query.filter(
        ((Message.sender_id == current_user.id) | (Message.receiver_id == current_user.id)),
        Message.group_id == None
    ).order_by(Message.timestamp.desc()).all()
    
    for m in msgs_with_others:
        partner_id = m.receiver_id if m.sender_id == current_user.id else m.sender_id
        if partner_id in seen_partners: continue
        seen_partners.add(partner_id)
        partner = User.query.get(partner_id)
        if not partner: continue
        unread = Message.query.filter_by(sender_id=partner_id, receiver_id=current_user.id).filter(
            ~Message.read_by.any(MessageRead.user_id == current_user.id)
        ).count()
        archived = ArchivedChat.query.filter_by(user_id=current_user.id, chat_type='dm', chat_id=partner_id).first()
        muted = MutedChat.query.filter_by(user_id=current_user.id, chat_type='dm', chat_id=partner_id).first()
        pinned = PinnedMessage.query.filter_by(chat_type='dm', chat_id=partner_id).first()
        chats.append({
            'type': 'dm', 'id': partner_id, 'name': partner.username,
            'avatar': partner.avatar, 'is_online': partner.is_online,
            'last_seen': partner.last_seen.isoformat() + 'Z',
            'last_message': msg_to_dict(m, current_user.id),
            'unread': unread, 'archived': bool(archived), 'muted': bool(muted),
            'pinned': bool(pinned), 'about': partner.about
        })
    
    # Groups
    for g in current_user.groups:
        last_msg = Message.query.filter_by(group_id=g.id).order_by(Message.timestamp.desc()).first()
        unread = Message.query.filter_by(group_id=g.id).filter(
            Message.sender_id != current_user.id,
            ~Message.read_by.any(MessageRead.user_id == current_user.id)
        ).count()
        archived = ArchivedChat.query.filter_by(user_id=current_user.id, chat_type='group', chat_id=g.id).first()
        muted = MutedChat.query.filter_by(user_id=current_user.id, chat_type='group', chat_id=g.id).first()
        chats.append({
            'type': 'group', 'id': g.id, 'name': g.name, 'avatar': g.avatar,
            'description': g.description, 'member_count': len(g.members),
            'last_message': msg_to_dict(last_msg, current_user.id) if last_msg else None,
            'unread': unread, 'archived': bool(archived), 'muted': bool(muted),
            'is_admin': current_user in g.admins
        })
    
    chats.sort(key=lambda x: x['last_message']['timestamp'] if x.get('last_message') else '0', reverse=True)
    return jsonify(chats)

@app.route('/api/chats/archive', methods=['POST'])
@login_required
def archive_chat():
    data = request.get_json()
    existing = ArchivedChat.query.filter_by(user_id=current_user.id, chat_type=data['type'], chat_id=data['id']).first()
    if existing:
        db.session.delete(existing)
    else:
        db.session.add(ArchivedChat(user_id=current_user.id, chat_type=data['type'], chat_id=data['id']))
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/chats/mute', methods=['POST'])
@login_required
def mute_chat():
    data = request.get_json()
    existing = MutedChat.query.filter_by(user_id=current_user.id, chat_type=data['type'], chat_id=data['id']).first()
    if existing:
        db.session.delete(existing)
    else:
        db.session.add(MutedChat(user_id=current_user.id, chat_type=data['type'], chat_id=data['id']))
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/pin', methods=['POST'])
@login_required
def pin_message():
    data = request.get_json()
    existing = PinnedMessage.query.filter_by(chat_type=data['chat_type'], chat_id=data['chat_id']).first()
    if existing: db.session.delete(existing)
    db.session.add(PinnedMessage(chat_type=data['chat_type'], chat_id=data['chat_id'],
                                  message_id=data['message_id'], pinned_by=current_user.id))
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/pin/<chat_type>/<int:chat_id>')
@login_required
def get_pinned(chat_type, chat_id):
    p = PinnedMessage.query.filter_by(chat_type=chat_type, chat_id=chat_id).first()
    if p and p.message:
        return jsonify(msg_to_dict(p.message, current_user.id))
    return jsonify(None)

# ─── GROUPS API ───────────────────────────────────────────────────────────────

@app.route('/api/groups', methods=['POST'])
@login_required
def create_group():
    data = request.get_json()
    g = Group(name=data['name'], description=data.get('description', ''),
              created_by=current_user.id, invite_link=uuid.uuid4().hex[:12])
    g.members.append(current_user)
    g.admins.append(current_user)
    for uid in data.get('members', []):
        u = User.query.get(uid)
        if u and u not in g.members:
            g.members.append(u)
    db.session.add(g)
    db.session.commit()
    for m in g.members:
        socketio.emit('group_created', {'group_id': g.id, 'name': g.name}, room=f"user_{m.id}")
    return jsonify({'success': True, 'group': {'id': g.id, 'name': g.name, 'invite_link': g.invite_link}})

@app.route('/api/groups/<int:gid>')
@login_required
def get_group(gid):
    g = Group.query.get_or_404(gid)
    return jsonify({
        'id': g.id, 'name': g.name, 'description': g.description, 'avatar': g.avatar,
        'created_by': g.created_by, 'invite_link': g.invite_link,
        'only_admins_message': g.only_admins_message,
        'members': [user_to_dict(m) for m in g.members],
        'admins': [m.id for m in g.admins],
        'created_at': g.created_at.isoformat() + 'Z'
    })

@app.route('/api/groups/<int:gid>', methods=['PUT'])
@login_required
def update_group(gid):
    g = Group.query.get_or_404(gid)
    if current_user not in g.admins:
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.get_json()
    for field in ['name', 'description', 'only_admins_message']:
        if field in data: setattr(g, field, data[field])
    db.session.commit()
    socketio.emit('group_updated', {'id': g.id, 'name': g.name, 'description': g.description}, room=f"group_{g.id}")
    return jsonify({'success': True})

@app.route('/api/groups/<int:gid>/members', methods=['POST'])
@login_required
def add_group_member(gid):
    g = Group.query.get_or_404(gid)
    if current_user not in g.admins:
        return jsonify({'error': 'Unauthorized'}), 403
    data = request.get_json()
    u = User.query.get(data['user_id'])
    if u and u not in g.members:
        g.members.append(u)
        db.session.commit()
        socketio.emit('group_member_added', {'group_id': gid, 'user': user_to_dict(u)}, room=f"group_{gid}")
        socketio.emit('group_created', {'group_id': g.id, 'name': g.name}, room=f"user_{u.id}")
    return jsonify({'success': True})

@app.route('/api/groups/<int:gid>/members/<int:uid>', methods=['DELETE'])
@login_required
def remove_group_member(gid, uid):
    g = Group.query.get_or_404(gid)
    if current_user not in g.admins and current_user.id != uid:
        return jsonify({'error': 'Unauthorized'}), 403
    u = User.query.get(uid)
    if u and u in g.members:
        g.members.remove(u)
        if u in g.admins: g.admins.remove(u)
        db.session.commit()
        socketio.emit('group_member_removed', {'group_id': gid, 'user_id': uid}, room=f"group_{gid}")
    return jsonify({'success': True})

@app.route('/api/groups/<int:gid>/admin/<int:uid>', methods=['POST'])
@login_required
def make_admin(gid, uid):
    g = Group.query.get_or_404(gid)
    if current_user not in g.admins: return jsonify({'error': 'Unauthorized'}), 403
    u = User.query.get(uid)
    if u and u in g.members and u not in g.admins:
        g.admins.append(u)
        db.session.commit()
    return jsonify({'success': True})

@app.route('/api/groups/join/<invite_link>')
@login_required
def join_group(invite_link):
    g = Group.query.filter_by(invite_link=invite_link).first_or_404()
    if current_user not in g.members:
        g.members.append(current_user)
        db.session.commit()
        socketio.emit('group_member_added', {'group_id': g.id, 'user': user_to_dict(current_user)}, room=f"group_{g.id}")
    return jsonify({'success': True, 'group_id': g.id})

@app.route('/api/groups/<int:gid>/avatar', methods=['POST'])
@login_required
def upload_group_avatar(gid):
    g = Group.query.get_or_404(gid)
    if current_user not in g.admins: return jsonify({'error': 'Unauthorized'}), 403
    f = request.files.get('file')
    if not f: return jsonify({'error': 'No file'}), 400
    ext = f.filename.rsplit('.', 1)[1].lower() if '.' in f.filename else 'jpg'
    fname = f"group_{gid}_{uuid.uuid4().hex[:8]}.{ext}"
    path = os.path.join(app.config['UPLOAD_FOLDER'], fname)
    try:
        img = Image.open(f); img = img.convert('RGB'); img.thumbnail((400,400)); img.save(path)
    except:
        f.seek(0); f.save(path)
    g.avatar = f"/static/uploads/{fname}"
    db.session.commit()
    return jsonify({'url': g.avatar})

# ─── STATUS API ───────────────────────────────────────────────────────────────

@app.route('/api/statuses')
@login_required
def get_statuses():
    from datetime import timedelta
    cutoff = datetime.utcnow() - timedelta(hours=24)
    # Current user statuses
    mine = Status.query.filter_by(user_id=current_user.id).filter(Status.timestamp > cutoff).all()
    # Contacts statuses
    contact_ids = [c.id for c in current_user.contacts_rel]
    others = Status.query.filter(Status.user_id.in_(contact_ids), Status.timestamp > cutoff).all()
    def status_dict(s):
        return {
            'id': s.id, 'user_id': s.user_id, 'username': s.user.username,
            'avatar': s.user.avatar, 'content': s.content, 'media_url': s.media_url,
            'media_type': s.media_type, 'bg_color': s.bg_color, 'font_style': s.font_style,
            'timestamp': s.timestamp.isoformat() + 'Z',
            'viewers': [{'id': v.viewer_id, 'name': v.viewer.username} for v in s.viewers],
            'viewed': any(v.viewer_id == current_user.id for v in s.viewers)
        }
    return jsonify({'mine': [status_dict(s) for s in mine], 'others': [status_dict(s) for s in others]})

@app.route('/api/statuses', methods=['POST'])
@login_required
def create_status():
    data = request.get_json()
    from datetime import timedelta
    s = Status(user_id=current_user.id, content=data.get('content',''),
               media_url=data.get('media_url',''), media_type=data.get('media_type','text'),
               bg_color=data.get('bg_color','#075E54'), font_style=data.get('font_style','normal'),
               expires_at=datetime.utcnow() + timedelta(hours=24))
    db.session.add(s); db.session.commit()
    return jsonify({'success': True, 'id': s.id})

@app.route('/api/statuses/<int:sid>/view', methods=['POST'])
@login_required
def view_status(sid):
    existing = StatusView.query.filter_by(status_id=sid, viewer_id=current_user.id).first()
    if not existing:
        db.session.add(StatusView(status_id=sid, viewer_id=current_user.id))
        db.session.commit()
    return jsonify({'success': True})

@app.route('/api/statuses/<int:sid>', methods=['DELETE'])
@login_required
def delete_status(sid):
    s = Status.query.get_or_404(sid)
    if s.user_id != current_user.id: return jsonify({'error': 'Unauthorized'}), 403
    db.session.delete(s); db.session.commit()
    return jsonify({'success': True})

# ─── CALLS API ────────────────────────────────────────────────────────────────

@app.route('/api/calls')
@login_required
def get_calls():
    calls = Call.query.filter(
        (Call.caller_id == current_user.id) | (Call.receiver_id == current_user.id)
    ).order_by(Call.timestamp.desc()).limit(50).all()
    return jsonify([{
        'id': c.id, 'caller_id': c.caller_id, 'receiver_id': c.receiver_id,
        'caller_name': c.caller.username, 'receiver_name': c.receiver.username,
        'caller_avatar': c.caller.avatar, 'receiver_avatar': c.receiver.avatar,
        'type': c.call_type, 'status': c.status, 'duration': c.duration,
        'timestamp': c.timestamp.isoformat() + 'Z',
        'is_incoming': c.receiver_id == current_user.id
    } for c in calls])

# ─── SOCKETIO EVENTS ──────────────────────────────────────────────────────────

@socketio.on('connect')
def on_connect():
    if current_user.is_authenticated:
        join_room(f"user_{current_user.id}")
        current_user.is_online = True
        current_user.last_seen = datetime.utcnow()
        db.session.commit()
        emit('online_status', {'user_id': current_user.id, 'is_online': True}, broadcast=True)

@socketio.on('disconnect')
def on_disconnect():
    if current_user.is_authenticated:
        current_user.is_online = False
        current_user.last_seen = datetime.utcnow()
        db.session.commit()
        emit('online_status', {'user_id': current_user.id, 'is_online': False, 
                                'last_seen': current_user.last_seen.isoformat() + 'Z'}, broadcast=True)

@socketio.on('join_dm')
def on_join_dm(data):
    other_id = data.get('other_id')
    room = f"dm_{min(current_user.id, other_id)}_{max(current_user.id, other_id)}"
    join_room(room)

@socketio.on('leave_dm')
def on_leave_dm(data):
    other_id = data.get('other_id')
    room = f"dm_{min(current_user.id, other_id)}_{max(current_user.id, other_id)}"
    leave_room(room)

@socketio.on('join_group')
def on_join_group(data):
    join_room(f"group_{data['group_id']}")

@socketio.on('leave_group')
def on_leave_group(data):
    leave_room(f"group_{data['group_id']}")

@socketio.on('send_message')
def on_send_message(data):
    if not current_user.is_authenticated: return
    msg = Message(
        sender_id=current_user.id,
        receiver_id=data.get('receiver_id'),
        group_id=data.get('group_id'),
        content=data.get('content', ''),
        msg_type=data.get('type', 'text'),
        file_url=data.get('file_url', ''),
        file_name=data.get('file_name', ''),
        file_size=data.get('file_size', 0),
        thumbnail=data.get('thumbnail', ''),
        duration=data.get('duration', 0),
        latitude=data.get('latitude'),
        longitude=data.get('longitude'),
        reply_to_id=data.get('reply_to_id')
    )
    db.session.add(msg); db.session.commit()
    msg_data = msg_to_dict(msg, current_user.id)
    if data.get('group_id'):
        room = f"group_{data['group_id']}"
    else:
        rid = data.get('receiver_id')
        room = f"dm_{min(current_user.id, rid)}_{max(current_user.id, rid)}"
    emit('new_message', msg_data, room=room)
    # Notify receiver if DM
    if data.get('receiver_id'):
        emit('chat_notification', {'message': msg_data, 'from_id': current_user.id}, 
             room=f"user_{data['receiver_id']}")

@socketio.on('typing')
def on_typing(data):
    room = data.get('room')
    emit('user_typing', {'user_id': current_user.id, 'username': current_user.username,
                          'is_typing': data.get('is_typing', False)}, room=room, include_self=False)

@socketio.on('call_user')
def on_call_user(data):
    c = Call(caller_id=current_user.id, receiver_id=data['receiver_id'],
             call_type=data.get('type', 'voice'), status='calling')
    db.session.add(c); db.session.commit()
    emit('incoming_call', {
        'call_id': c.id, 'caller_id': current_user.id,
        'caller_name': current_user.username, 'caller_avatar': current_user.avatar,
        'type': data.get('type', 'voice')
    }, room=f"user_{data['receiver_id']}")

@socketio.on('call_answer')
def on_call_answer(data):
    c = Call.query.get(data['call_id'])
    if c:
        c.status = 'answered'; db.session.commit()
        emit('call_answered', {'call_id': c.id}, room=f"user_{c.caller_id}")

@socketio.on('call_decline')
def on_call_decline(data):
    c = Call.query.get(data['call_id'])
    if c:
        c.status = 'declined'; db.session.commit()
        emit('call_declined', {'call_id': c.id}, room=f"user_{c.caller_id}")

@socketio.on('call_end')
def on_call_end(data):
    c = Call.query.get(data['call_id'])
    if c:
        c.duration = data.get('duration', 0)
        if c.status == 'calling': c.status = 'missed'
        db.session.commit()
        other_id = c.receiver_id if c.caller_id == current_user.id else c.caller_id
        emit('call_ended', {'call_id': c.id, 'duration': c.duration}, room=f"user_{other_id}")

@socketio.on('webrtc_offer')
def on_webrtc_offer(data):
    emit('webrtc_offer', data, room=f"user_{data['to']}")

@socketio.on('webrtc_answer')
def on_webrtc_answer(data):
    emit('webrtc_answer', data, room=f"user_{data['to']}")

@socketio.on('webrtc_ice')
def on_webrtc_ice(data):
    emit('webrtc_ice', data, room=f"user_{data['to']}")

@socketio.on('mark_read')
def on_mark_read(data):
    msg_ids = data.get('message_ids', [])
    for mid in msg_ids:
        if not MessageRead.query.filter_by(message_id=mid, user_id=current_user.id).first():
            db.session.add(MessageRead(message_id=mid, user_id=current_user.id))
    db.session.commit()
    # Notify sender
    if msg_ids:
        m = Message.query.get(msg_ids[-1])
        if m and m.sender_id:
            emit('messages_read', {'message_ids': msg_ids, 'reader_id': current_user.id},
                 room=f"user_{m.sender_id}")

@socketio.on('forward_message')
def on_forward(data):
    orig = Message.query.get(data['message_id'])
    if not orig: return
    for rid in data.get('receivers', []):
        m = Message(sender_id=current_user.id, receiver_id=rid if not data.get('group') else None,
                    group_id=rid if data.get('group') else None,
                    content=orig.content, msg_type=orig.msg_type, file_url=orig.file_url,
                    file_name=orig.file_name, forwarded_from_id=orig.sender_id)
        db.session.add(m)
        db.session.commit()
        msg_data = msg_to_dict(m, current_user.id)
        if data.get('group'):
            emit('new_message', msg_data, room=f"group_{rid}")
        else:
            room = f"dm_{min(current_user.id, rid)}_{max(current_user.id, rid)}"
            emit('new_message', msg_data, room=room)

@app.before_request
def initialize_database():
    if not hasattr(app, 'db_initialized'):
        db.create_all()
        # Create demo users
        if not User.query.first():
            u1 = User(username='alice', phone='+1234567890',
                      password_hash=bcrypt.generate_password_hash('password').decode('utf-8'),
                      about='Hey! I am Alice 👋')
            u2 = User(username='bob', phone='+9876543210',
                      password_hash=bcrypt.generate_password_hash('password').decode('utf-8'),
                      about='Bob here! 😊')
            u3 = User(username='charlie', phone='+1122334455',
                      password_hash=bcrypt.generate_password_hash('password').decode('utf-8'),
                      about='Charlie the developer 💻')
            db.session.add_all([u1, u2, u3])
            db.session.commit()
            u1.contacts_rel.append(u2); u1.contacts_rel.append(u3)
            u2.contacts_rel.append(u1); u3.contacts_rel.append(u1)
            db.session.commit()
        app.db_initialized = True

if __name__ == '__main__':
    print("\n✅ WhatsApp Clone is starting...")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("🌐 Open: http://localhost:5000")
    print("👤 Demo Users:")
    print("   alice / password")
    print("   bob   / password")
    print("   charlie / password")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
    socketio.run(app, debug=True, port=5000, host='0.0.0.0')
