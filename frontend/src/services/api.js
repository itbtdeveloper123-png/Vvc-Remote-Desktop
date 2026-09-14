/**
 * Unified API Service for Vvc Remote Desktop
 */

// Memory cache for host token returned by /api/info on localhost
let cachedHostToken = null;

export function setHostToken(token) {
  cachedHostToken = token;
}

export function getHostToken() {
  return cachedHostToken;
}

function getHostHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (cachedHostToken) {
    headers['X-Host-Token'] = cachedHostToken;
  }
  return headers;
}

// --- Host Identity & Controls ---
export async function fetchHostInfo() {
  const res = await fetch('/api/info');
  if (!res.ok) throw new Error('Failed to fetch host info');
  const data = await res.json();
  if (data.host_token) {
    setHostToken(data.host_token);
  }
  return data;
}

export async function refreshPin() {
  const res = await fetch('/api/refresh-pin', {
    method: 'POST',
    headers: getHostHeaders()
  });
  if (!res.ok) throw new Error('Failed to refresh PIN');
  return await res.json();
}

export async function updatePermissions(allowMouse, allowKeyboard) {
  const res = await fetch('/api/permissions', {
    method: 'POST',
    headers: getHostHeaders(),
    body: JSON.stringify({ allow_mouse: allowMouse, allow_keyboard: allowKeyboard })
  });
  if (!res.ok) throw new Error('Failed to update permissions');
  return await res.json();
}

export async function fetchAutostart() {
  const res = await fetch('/api/autostart', { headers: getHostHeaders() });
  return await res.json();
}

export async function setAutostart(enabled) {
  const res = await fetch('/api/autostart', {
    method: 'POST',
    headers: getHostHeaders(),
    body: JSON.stringify({ enabled })
  });
  return await res.json();
}

export async function fetchAutoAccept() {
  const res = await fetch('/api/settings/auto-accept', { headers: getHostHeaders() });
  return await res.json();
}

export async function setAutoAccept(enabled) {
  const res = await fetch('/api/settings/auto-accept', {
    method: 'POST',
    headers: getHostHeaders(),
    body: JSON.stringify({ enabled })
  });
  return await res.json();
}

// --- Connection Approval Lifecycle ---
export async function resolvePeer(target) {
  const res = await fetch(`/api/resolve-peer?target=${encodeURIComponent(target)}`);
  return await res.json();
}

export async function initConnectRequest(targetBaseUrl, peerId) {
  const baseUrl = targetBaseUrl || '';
  const res = await fetch(`${baseUrl}/api/connect-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ peer_id: peerId })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Connection request failed');
  }
  return await res.json();
}

export async function pollConnectStatus(targetBaseUrl, requestId) {
  const baseUrl = targetBaseUrl || '';
  const res = await fetch(`${baseUrl}/api/connect-request/status?request_id=${encodeURIComponent(requestId)}`);
  if (!res.ok) return null;
  return await res.json();
}

export async function cancelConnectRequest(targetBaseUrl, requestId) {
  const baseUrl = targetBaseUrl || '';
  const res = await fetch(`${baseUrl}/api/connect-request/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_id: requestId })
  });
  return await res.json();
}

export async function pollIncomingRequests() {
  const res = await fetch('/api/connect-requests', { headers: getHostHeaders() });
  if (!res.ok) return { requests: [] };
  return await res.json();
}

export async function respondIncomingRequest(requestId, action, allowMouse = true, allowKeyboard = true) {
  const res = await fetch('/api/connect-request/respond', {
    method: 'POST',
    headers: getHostHeaders(),
    body: JSON.stringify({
      request_id: requestId,
      action: action,
      allow_mouse: allowMouse,
      allow_keyboard: allowKeyboard
    })
  });
  return await res.json();
}

// --- History & LAN Discovery ---
export async function fetchHistory() {
  const res = await fetch('/api/history', { headers: getHostHeaders() });
  return await res.json();
}

export async function addHistory(remoteId, remoteIp) {
  const res = await fetch('/api/history', {
    method: 'POST',
    headers: getHostHeaders(),
    body: JSON.stringify({
      remote_id: remoteId,
      remote_ip: remoteIp,
      direction: 'outgoing',
      status: 'connected'
    })
  });
  return await res.json();
}

export async function deleteHistoryItem(id) {
  const res = await fetch(`/api/history/${id}`, {
    method: 'DELETE',
    headers: getHostHeaders()
  });
  return await res.json();
}

export async function clearAllHistory() {
  const res = await fetch('/api/history', {
    method: 'DELETE',
    headers: getHostHeaders()
  });
  return await res.json();
}

export async function updatePeerAlias(remoteId, alias) {
  const res = await fetch('/api/history/alias', {
    method: 'POST',
    headers: getHostHeaders(),
    body: JSON.stringify({ remote_id: remoteId, alias })
  });
  return await res.json();
}

export async function fetchDiscoveredPeers() {
  const res = await fetch('/api/peers');
  return await res.json();
}

// --- Remote File Explorer ---
export async function fetchDrives(baseUrl = '', sessionId = '') {
  const q = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
  const res = await fetch(`${baseUrl}/api/files/drives${q}`, {
    headers: getHostHeaders()
  });
  if (!res.ok) throw new Error('Failed to load remote drives');
  return await res.json();
}

export async function fetchFileList(baseUrl = '', path = 'C:\\', sessionId = '') {
  const q = sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : '';
  const res = await fetch(`${baseUrl}/api/files/list?path=${encodeURIComponent(path)}${q}`, {
    headers: getHostHeaders()
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to access directory' }));
    throw new Error(err.detail || 'Access error');
  }
  return await res.json();
}

export function getDownloadUrl(baseUrl = '', path = '', sessionId = '') {
  const q = sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : '';
  return `${baseUrl}/api/files/download?path=${encodeURIComponent(path)}${q}`;
}

export async function uploadFile(baseUrl = '', path = '', file, sessionId = '') {
  const formData = new FormData();
  formData.append('path', path);
  if (sessionId) formData.append('session_id', sessionId);
  formData.append('file', file);

  const headers = {};
  if (cachedHostToken) headers['X-Host-Token'] = cachedHostToken;

  const res = await fetch(`${baseUrl}/api/files/upload`, {
    method: 'POST',
    headers: headers,
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Upload error' }));
    throw new Error(err.detail || 'Upload failed');
  }
  return await res.json();
}

export async function makeDirectory(baseUrl = '', path = '', folderName = '', sessionId = '') {
  const headers = getHostHeaders();
  const res = await fetch(`${baseUrl}/api/files/mkdir`, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      path,
      folder_name: folderName,
      session_id: sessionId || undefined
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Mkdir error' }));
    throw new Error(err.detail || 'Folder creation failed');
  }
  return await res.json();
}

export async function deleteFileItem(baseUrl = '', path = '', sessionId = '') {
  const headers = getHostHeaders();
  const res = await fetch(`${baseUrl}/api/files/delete`, {
    method: 'DELETE',
    headers: headers,
    body: JSON.stringify({
      path,
      session_id: sessionId || undefined
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Delete error' }));
    throw new Error(err.detail || 'Delete failed');
  }
  return await res.json();
}

export async function wakeRemoteScreen(baseUrl = '', sessionId = '') {
  const q = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
  const res = await fetch(`${baseUrl}/api/screen/wake${q}`, {
    method: 'POST',
    headers: getHostHeaders()
  });
  return await res.json();
}
