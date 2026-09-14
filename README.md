# AnyDesk-Inspired High-Performance Remote Desktop Prototype

An end-to-end, functional Remote Desktop system built for ultra-low-latency desktop streaming, bi-directional input simulation, and session security, inspired by the architecture and sleek user experience of **AnyDesk**.

---

## 🌟 Key Features

1. **Ultra-Low-Latency Screen Capture Engine**:
   - Built on `mss` and Windows GDI native capture.
   - Synchronizes with Win32 Input Desktop (`OpenInputDesktop` & `SetThreadDesktop`) to eliminate `ERROR_ACCESS_DENIED` and `ERROR_INVALID_HANDLE` errors in background sessions.
   - Dynamically composites the hardware mouse pointer directly onto the video frames (`GetCursorInfo`) for true WYSIWYG remote interaction.
   - Dedicated worker thread maintaining 30–60 FPS with zero blocking on the network event loop.

2. **Dual-Mode Streaming Architecture**:
   - **Primary (WebRTC P2P)**: Hardware-accelerated H.264/VP8 real-time video track via `aiortc` coupled with unordered low-latency `RTCDataChannel` for mouse and keyboard events.
   - **Fallback (High-Speed WebSocket)**: Compressed JPEG binary stream delivering sub-50ms frames to an HTML5 Canvas when UDP/WebRTC is restricted by enterprise firewalls.

3. **Win32 Input Injection & Normalization**:
   - Captures client mouse movements, clicks, wheel scrolling, and keystrokes.
   - Normalizes client coordinates `[0.0, 1.0]` against the remote display aspect ratio (handling letterboxing and pillarboxing).
   - Injects native Windows events using `user32.SendInput` via `ctypes` with virtual key code and hardware scan code translation.
   - Shortcut forwarder supporting special triggers like **Ctrl+Alt+Del** and the **Windows Key**.

4. **AnyDesk Security Model**:
   - Generates an AnyDesk-style 9-digit address (`XXX XXX XXX`).
   - Generates a secure, refreshable 6-digit one-time connection PIN.
   - Host-side permission switches allowing immediate revocation of mouse or keyboard control.

5. **Aesthetics & Client UI**:
   - Glassmorphic dark theme styled with AnyDesk's iconic crimson accents.
   - Top floating HUD displaying real-time **Round-Trip Time (RTT latency)**, **FPS**, **resolution**, and connection protocol.
   - Fully responsive across desktop, tablet, and mobile browsers with zero client installation.

---

## 🏗 System Architecture

```
+-----------------------------------------------------------------------------------+
|                                  REMOTE CLIENT                                    |
|   (Modern AnyDesk-style Web UI / HTML5 Canvas / WebRTC Video / Input Normalizer)  |
+-----------------------------------------------------------------------------------+
           |                                                      ^
           | 1. Signaling (Offer/Answer/ICE, PIN Auth)            | 2. P2P Stream
           v                                                      |    (WebRTC / WS)
+----------------------------------------+                        |
|        SIGNALING SERVER (WebSocket)    |                        |
|   - Peer ID Registry (XXX-XXX-XXX)     |                        |
|   - Session Token Verification         |                        |
|   - Web Client Static Hosting          |                        |
+----------------------------------------+                        |
           |                                                      |
           | Signaling Handshake & Routing                        |
           v                                                      |
+-----------------------------------------------------------------+-----------------+
|                                   HOST MACHINE                                    |
|  +---------------------------+  +--------------------------+  +----------------+  |
|  | Desktop Capture Engine    |  | Input Simulation Engine  |  | Security & Auth|  |
|  | - SetThreadDesktop sync   |  | - Win32 SendInput ctypes |  | - 9-digit ID   |  |
|  | - mss fast frame grabbing |  | - Coord normalization    |  | - 6-digit PIN  |  |
|  | - Hardware cursor overlay |  | - Mouse/Keys/Scroll/Drag |  | - Permissions  |  |
|  +---------------------------+  +--------------------------+  +----------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 📁 Directory Structure

```
d:/remote desktop/
├── app/
│   ├── config.py                 # Network, capture, and security configuration
│   ├── core/
│   │   ├── desktop_helper.py     # Win32 desktop switching & cursor overlay
│   │   ├── screen_capture.py     # Threaded screen capture engine
│   │   ├── input_injector.py     # Win32 SendInput simulation & key mappings
│   │   └── security.py           # Peer ID & PIN generator, session manager
│   ├── network/
│   │   ├── signaling.py          # FastAPI signaling router & endpoints
│   │   ├── webrtc_host.py        # aiortc WebRTC peer connection & video track
│   │   └── websocket_stream.py   # Fallback binary WebSocket stream
│   └── static/                   # Web Client GUI
│       ├── index.html            # AnyDesk single-page dashboard & viewer
│       ├── css/style.css         # Dark glassmorphic design system
│       └── js/
│           ├── ui.js             # Telemetry, modals, permissions, HUD
│           ├── input_handler.js  # Coordinate normalization & event capture
│           └── webrtc_client.js  # WebRTC peer connection & stream player
├── tests/
│   ├── test_security.py          # Unit tests for security manager
│   ├── test_capture.py           # Unit tests for capture & desktop attachment
│   └── test_input.py             # Unit tests for input simulation
├── main.py                       # Unified Host & Server runner
├── requirements.txt              # Python dependencies
└── README.md                     # Documentation
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Run the Host
```bash
python main.py
```

Console Output:
```
=================================================================
      _           _____            _      _____           
     / \   _ __  |  __ \  ___  ___| | __ |  __ \ _ __ ___ 
    / _ \ | '_ \ | |  | |/ _ \/ __| |/ / | |__) | '__/ _ \
   / ___ \| | | || |__| |  __/\__ \   <  |  ___/| | | (_) |
  /_/   \_\_| |_||_____/ \___||___/_|\_\ |_|    |_|  \___/ 
          High-Performance Remote Desktop Prototype       
=================================================================
  [+] THIS DESK ADDRESS (ID) : 842 195 723
  [+] ONE-TIME SECURITY PIN  : 482019
  [+] MONITOR RESOLUTION     : 1366x768 @ 30 FPS
-----------------------------------------------------------------
  [>] Local Web Dashboard   : http://localhost:8000
  [>] Network Access Link    : http://192.168.1.15:8000
=================================================================
  [*] Ready for incoming remote connections. Press Ctrl+C to stop.
```

### 3. Connect from Client
1. Open `http://localhost:8000` (or `http://<HOST_IP>:8000` on any phone, tablet, or remote PC).
2. Under **Remote Desk**, enter the 9-digit address of the target machine and click **Connect**.
3. When prompted, enter the 6-digit **PIN**.
4. The remote desktop session will launch instantly in fullscreen or windowed mode with live interactive control and real-time telemetry!

---

## 🧪 Running Automated Tests

```bash
python -m unittest discover -s tests -v
```
All 13 unit tests validate:
- Desktop input attachment (`SetThreadDesktop`)
- Non-blocking frame capture and hardware cursor compositing
- Win32 `SendInput` coordinate normalization and key codes
- PIN security and session access control
