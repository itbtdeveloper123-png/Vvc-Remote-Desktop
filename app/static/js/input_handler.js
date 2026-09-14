/**
 * Client Remote Input Normalization and Dispatcher
 * High-performance, zero-latency mouse dragging and input synchronization.
 */
class RemoteInputHandler {
  constructor(targetElement, sendCallback) {
    this.target = targetElement;
    this.send = sendCallback;
    this.isActive = false;

    this.nativeWidth = 1920;
    this.nativeHeight = 1080;

    // Movement & Drag state
    this.isDragging = false;
    this._lastMoveTime = 0;
    this._pendingMove = null;
    this._rafId = null;

    this._bindListeners();
  }

  setNativeResolution(width, height) {
    if (width && height) {
      this.nativeWidth = width;
      this.nativeHeight = height;
    }
  }

  start() {
    this.isActive = true;
  }

  stop() {
    this.isActive = false;
    this.isDragging = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _bindListeners() {
    // Mouse events on display target
    this.target.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.target.addEventListener('mousedown', (e) => this._onMouseButton(e, 'mousedown'));
    this.target.addEventListener('mouseup', (e) => this._onMouseButton(e, 'mouseup'));
    this.target.addEventListener('contextmenu', (e) => {
      e.preventDefault(); // Prevent browser context menu
    });
    this.target.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });

    // Global window listeners to maintain smooth dragging even when mouse cursor moves outside viewport
    window.addEventListener('mousemove', (e) => {
      if (this.isActive && this.isDragging) {
        this._onMouseMove(e);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.isActive && this.isDragging) {
        this._onMouseButton(e, 'mouseup');
      }
    });

    // Keyboard events
    window.addEventListener('keydown', (e) => this._onKey(e, 'keydown'));
    window.addEventListener('keyup', (e) => this._onKey(e, 'keyup'));
  }

  /**
   * Calculates normalized (0.0 to 1.0) coordinates accounting for
   * object-fit: contain letterboxing/pillarboxing inside the viewport element.
   */
  _getNormalizedCoordinates(clientX, clientY) {
    const rect = this.target.getBoundingClientRect();
    const elemW = rect.width;
    const elemH = rect.height;

    if (elemW <= 0 || elemH <= 0) return { normX: 0.5, normY: 0.5 };

    const sourceAspect = this.nativeWidth / this.nativeHeight;
    const containerAspect = elemW / elemH;

    let displayW, displayH, offsetX, offsetY;

    if (containerAspect > sourceAspect) {
      // Pillarboxed (black bars on left/right)
      displayH = elemH;
      displayW = elemH * sourceAspect;
      offsetX = (elemW - displayW) / 2;
      offsetY = 0;
    } else {
      // Letterboxed (black bars on top/bottom)
      displayW = elemW;
      displayH = elemW / sourceAspect;
      offsetX = 0;
      offsetY = (elemH - displayH) / 2;
    }

    const mouseX = clientX - rect.left - offsetX;
    const mouseY = clientY - rect.top - offsetY;

    const normX = Math.max(0, Math.min(1, mouseX / displayW));
    const normY = Math.max(0, Math.min(1, mouseY / displayH));

    return { normX, normY };
  }

  _onMouseMove(e) {
    if (!this.isActive) return;

    const { normX, normY } = this._getNormalizedCoordinates(e.clientX, e.clientY);
    this._pendingMove = { normX, normY };

    if (this.isDragging) {
      // Fast immediate dispatch during active window dragging
      if (!this._rafId) {
        this._rafId = requestAnimationFrame(() => this._dispatchMouseMove());
      }
    } else {
      const now = performance.now();
      // 120Hz smooth movement (~8ms)
      if (now - this._lastMoveTime >= 8) {
        this._dispatchMouseMove();
      } else if (!this._rafId) {
        this._rafId = requestAnimationFrame(() => this._dispatchMouseMove());
      }
    }
  }

  _dispatchMouseMove() {
    this._rafId = null;
    this._lastMoveTime = performance.now();
    if (this._pendingMove) {
      this.send({
        type: 'mousemove',
        x: this._pendingMove.normX,
        y: this._pendingMove.normY
      });
      this._pendingMove = null;
    }
  }

  _onMouseButton(e, action) {
    if (!this.isActive) return;
    e.preventDefault();

    const { normX, normY } = this._getNormalizedCoordinates(e.clientX, e.clientY);

    if (action === 'mousedown') {
      this.isDragging = true;
      // Immediately flush current mouse position before down click
      this.send({
        type: 'mousemove',
        x: normX,
        y: normY
      });
    } else if (action === 'mouseup') {
      this.isDragging = false;
    }

    this.send({
      type: action,
      button: e.button, // 0: left, 1: middle, 2: right
      x: normX,
      y: normY
    });
  }

  _onWheel(e) {
    if (!this.isActive) return;
    e.preventDefault();

    this.send({
      type: 'wheel',
      deltaX: e.deltaX,
      deltaY: e.deltaY
    });
  }

  _onKey(e, action) {
    if (!this.isActive) return;

    // Intercept common browser shortcuts to forward to remote machine
    if (['Tab', 'Alt', 'F5', 'Escape'].includes(e.key) || e.ctrlKey || e.altKey) {
      e.preventDefault();
    }

    this.send({
      type: action,
      code: e.code,
      key: e.key
    });
  }
}

window.RemoteInputHandler = RemoteInputHandler;
