#!/usr/bin/env python3
"""
WhatsApp Clone - Easy Runner
Usage: python run.py
"""
import sys
import subprocess

def check_and_install():
    print("🔍 Checking dependencies...")
    try:
        import flask, flask_socketio, flask_sqlalchemy, flask_login, flask_bcrypt, eventlet
        print("✅ All dependencies already installed!")
    except ImportError:
        print("📦 Installing dependencies (first time only)...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        print("✅ Dependencies installed!")

if __name__ == "__main__":
    check_and_install()
    print("\n" + "="*45)
    print("  🚀 Starting WhatsApp Clone...")
    print("="*45)
    # Run app module via subprocess so it executes the __main__ block
    subprocess.run([sys.executable, "app.py"])
