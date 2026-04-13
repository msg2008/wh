import urllib.request
import urllib.parse
import json

base = "http://localhost:5000"

# 1. Login
req = urllib.request.Request(f"{base}/login", data=json.dumps({"identifier": "alice", "password": "password"}).encode('utf-8'), headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req) as response:
        print("Login status:", response.status)
        print("Headers:", response.headers.get("Set-Cookie"))
        cookie = response.headers.get("Set-Cookie")
except urllib.error.HTTPError as e:
    print("Login error:", e.read().decode())
    exit(1)

# 2. Get Me
req2 = urllib.request.Request(f"{base}/api/me", headers={'Cookie': cookie})
try:
    with urllib.request.urlopen(req2) as resp:
        print("Me status:", resp.status)
except urllib.error.HTTPError as e:
    print("Me error:", e.read().decode())

# 3. Get Chats
req3 = urllib.request.Request(f"{base}/api/chats", headers={'Cookie': cookie})
try:
    with urllib.request.urlopen(req3) as resp:
        print("Chats status:", resp.status)
except urllib.error.HTTPError as e:
    print("Chats error:", e.read().decode())

# 4. Contacts
req4 = urllib.request.Request(f"{base}/api/contacts", headers={'Cookie': cookie})
try:
    with urllib.request.urlopen(req4) as resp:
        print("Contacts status:", resp.status)
except urllib.error.HTTPError as e:
    print("Contacts error:", e.read().decode())
