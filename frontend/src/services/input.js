/**
 * Remote Input Handler & Coordinate Normalizer for React
 */

export class RemoteInputHandler {
  constructor(targetElement, sendCallback) {
    this.target = targetElement;
    this.send = sendCallback;
    this.isActive = false;

    this.nativeWidth = 1920;
    this.nativeHeight = 1080;

    // Dragging & move throttling
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

  destroy() {
    this.stop();
    this._unbindListeners();
  }

  _bindListeners() {
    this._onMouseMoveHandler = (e) => this._onMouseMove(e);
    this._onMouseDownHandler = (e) => this._onMouseButton(e, 'mousedown');
    this._onMouseUpHandler = (e) => this._onMouseButton(e, 'mouseup');
    this._onContextMenuHandler = (e) => e.preventDefault();
    this._onWheelHandler = (e) => this._onWheel(e);
    this._onWindowMouseMove = (e) => {
      if (this.isActive && this.isDragging) this._onMouseMove(e);
    };
    this._onWindowMouseUp = (e) => {
      if (this.isActive && this.isDragging) this._onMouseButton(e, 'mouseup');
    };
    this._onKeyDown = (e) => this._onKey(e, 'keydown');
    this._onKeyUp = (e) => this._onKey(e, 'keyup');

    if (this.target) {
      this.target.addEventListener('mousemove', this._onMouseMoveHandler);
      this.target.addEventListener('mousedown', this._onMouseDownHandler);
      this.target.addEventListener('mouseup', this._onMouseUpHandler);
      this.target.addEventListener('contextmenu', this._onContextMenuHandler);
      this.target.addEventListener('wheel', this._onWheelHandler, { passive: false });
    }

    window.addEventListener('mousemove', this._onWindowMouseMove);
    window.addEventListener('mouseup', this._onWindowMouseUp);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  _unbindListeners() {
    if (this.target) {
      this.target.removeEventListener('mousemove', this._onMouseMoveHandler);
      this.target.removeEventListener('mousedown', this._onMouseDownHandler);
      this.target.removeEventListener('mouseup', this._onMouseUpHandler);
      this.target.removeEventListener('contextmenu', this._onContextMenuHandler);
      this.target.removeEventListener('wheel', this._onWheelHandler);
    }
    window.removeEventListener('mousemove', this._onWindowMouseMove);
    window.removeEventListener('mouseup', this._onWindowMouseUp);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }

  _getNormalizedCoordinates(clientX, clientY) {
    if (!this.target) return { normX: 0.5, normY: 0.5 };
    const rect = this.target.getBoundingClientRect();
    const elemW = rect.width;
    const elemH = rect.height;

    if (elemW <= 0 || elemH <= 0) return { normX: 0.5, normY: 0.5 };

    const sourceAspect = this.nativeWidth / this.nativeHeight;
    const containerAspect = elemW / elemH;

    let displayW, displayH, offsetX, offsetY;

    if (containerAspect > sourceAspect) {
      // Pillarbox (black bars left/right)
      displayH = elemH;
      displayW = elemH * sourceAspect;
      offsetX = (elemW - displayW) / 2;
      offsetY = 0;
    } else {
      // Letterbox (black bars top/bottom)
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
      if (!this._rafId) {
        this._rafId = requestAnimationFrame(() => this._dispatchMouseMove());
      }
    } else {
      const now = performance.now();
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
      this.send({ type: 'mousemove', x: normX, y: normY });
    } else if (action === 'mouseup') {
      this.isDragging = false;
    }

    this.send({
      type: action,
      button: e.button,
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
