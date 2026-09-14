# Vvc Remote Central Signaling Relay Server (100% Free Hosting Guide)

This is the Central Signaling and Rendezvous Server for **Vvc Remote Desktop**. It enables computers located anywhere in the world across different internet networks, Wi-Fi routers, and firewalls to discover and connect to each other instantly by typing their 9-digit address (`### ### ###`).

All audio, video, and control streams flow **Direct Peer-to-Peer (P2P)** via WebRTC. This server only handles a few bytes of JSON signaling, which makes it extremely fast, ultra lightweight, and **100% FREE to host forever**!

---

## How to Deploy on Render.com for Free (2 Minutes)

Render provides a 100% free web service tier with free SSL (HTTPS) and WebSocket support:

### Step 1: Create a Free Account
1. Open [https://render.com](https://render.com) and click **Sign Up** (using GitHub or Google).
2. No credit card is required.

### Step 2: Create a New Web Service
1. In your Render Dashboard, click **New +** -> **Web Service**.
2. Select **Build and deploy from a Git repository** (link your GitHub repo where this project is uploaded).
3. Configure the following fields:
   - **Name**: `vvc-remote-relay` (or any name you prefer)
   - **Root Directory**: `server`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn relay_server:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: Select **Free** ($0 / month)

### Step 3: Deploy!
1. Click **Deploy Web Service**.
2. Within 1-2 minutes, Render will provide you with a live HTTPS URL, for example:
   ```
   https://vvc-remote-relay.onrender.com
   ```

### Step 4: Plug the URL into Vvc Remote Desktop App
In `d:\remote desktop\app\config.py`:
```python
@dataclass
class NetworkConfig:
    host: str = "0.0.0.0"
    port: int = 8000
    central_relay_url: str = "https://vvc-remote-relay.onrender.com"
```
Or simply open **Settings (ការកំណត់)** inside the Vvc Remote desktop app, enter your Server URL, and save!

---

## របៀប Deploy លើ Render.com ដោយឥតគិតថ្លៃ (ភាសាខ្មែរ)

1. ចូលទៅកាន់ [https://render.com](https://render.com) រួចចុច **Sign Up** (ដោយប្រើ Gmail ឬ GitHub) ឥតគិតថ្លៃ និងមិនបាច់ដាក់កាតធនាគារឡើយ។
2. ចុចប៊ូតុង **New +** -> ជ្រើសរើស **Web Service**។
3. ជ្រើសរើស GitHub Repository របស់អ្នក។
4. កំណត់ដូចខាងក្រោម៖
   * **Root Directory**: `server`
   * **Build Command**: `pip install -r requirements.txt`
   * **Start Command**: `uvicorn relay_server:app --host 0.0.0.0 --port $PORT`
   * **Instance Type**: ជ្រើសយក **Free ($0/month)**
5. ចុច **Create Web Service**។
6. រង់ចាំប្រហែល ១ ទៅ ២ នាទី លោកអ្នកនឹងទទួលបាន Link មួយ (ឧទាហរណ៍ `https://vvc-remote-relay.onrender.com`)។
7. យក Link នោះទៅដាក់ក្នុង `app/config.py` ឬក្នុង Settings នៃកម្មវិធី Vvc Remote ជាការស្រេច!
