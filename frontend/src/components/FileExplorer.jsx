import React, { useState, useEffect, useRef } from 'react';
import {
  Folder, File, HardDrive, ArrowUp, RefreshCw, Upload, Plus,
  Download, Trash2, X, AlertCircle, FileText, Image, Film, Archive,
  FolderPlus
} from 'lucide-react';
import {
  fetchDrives, fetchFileList, getDownloadUrl, uploadFile,
  makeDirectory, deleteFileItem
} from '../services/api.js';

export function FileExplorer({
  isOpen,
  onClose,
  targetBaseUrl = '',
  sessionId = '',
  peerName = 'Remote Machine',
  onToast
}) {
  const [drives, setDrives] = useState([]);
  const [currentPath, setCurrentPath] = useState('C:\\');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newFolderModal, setNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const fileInputRef = useRef(null);

  // Load drives on initial open
  useEffect(() => {
    if (!isOpen) return;
    loadDrives();
  }, [isOpen, targetBaseUrl, sessionId]);

  // Load directory items when path changes
  useEffect(() => {
    if (!isOpen) return;
    loadDirectory(currentPath);
  }, [isOpen, currentPath, targetBaseUrl, sessionId]);

  const loadDrives = async () => {
    try {
      const data = await fetchDrives(targetBaseUrl, sessionId);
      if (data && data.drives && data.drives.length) {
        setDrives(data.drives);
        // Default to first drive if current path not set
        if (!currentPath) {
          setCurrentPath(data.drives[0].path || 'C:\\');
        }
      }
    } catch (err) {
      console.error('Failed to load drives:', err);
    }
  };

  const loadDirectory = async (path) => {
    setLoading(true);
    try {
      const res = await fetchFileList(targetBaseUrl, path, sessionId);
      if (res && res.items) {
        setItems(res.items);
        if (res.current_path) {
          setCurrentPath(res.current_path);
        }
      }
    } catch (err) {
      if (onToast) onToast(`Cannot read directory: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateUp = () => {
    if (!currentPath) return;
    const parts = currentPath.replace(/\\$/, '').split('\\');
    if (parts.length > 1) {
      parts.pop();
      const parent = parts.join('\\') + (parts.length === 1 ? '\\' : '');
      setCurrentPath(parent);
    }
  };

  const handleItemClick = (item) => {
    if (item.is_dir) {
      setCurrentPath(item.path);
    }
  };

  const handleUploadSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      await uploadFile(targetBaseUrl, currentPath, file, sessionId);
      if (onToast) onToast(`Uploaded ${file.name} successfully!`, 'success');
      loadDirectory(currentPath);
    } catch (err) {
      if (onToast) onToast(`Upload failed: ${err.message}`, 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      await makeDirectory(targetBaseUrl, currentPath, newFolderName.trim(), sessionId);
      if (onToast) onToast(`Folder "${newFolderName}" created`, 'success');
      setNewFolderModal(false);
      setNewFolderName('');
      loadDirectory(currentPath);
    } catch (err) {
      if (onToast) onToast(`Failed to create folder: ${err.message}`, 'error');
    }
  };

  const handleDeleteItem = async (item, e) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${item.name}"?`)) return;

    try {
      await deleteFileItem(targetBaseUrl, item.path, sessionId);
      if (onToast) onToast(`Deleted "${item.name}"`, 'success');
      loadDirectory(currentPath);
    } catch (err) {
      if (onToast) onToast(`Delete failed: ${err.message}`, 'error');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0 || bytes === undefined || bytes === null) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (item) => {
    if (item.is_dir) return <Folder size={18} color="#f59e0b" fill="#f59e0b" style={{ fillOpacity: 0.2 }} />;
    const ext = (item.name.split('.').pop() || '').toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) {
      return <Image size={18} color="#06b6d4" />;
    }
    if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) {
      return <Film size={18} color="#ec4899" />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return <Archive size={18} color="#f97316" />;
    }
    if (['txt', 'log', 'md', 'json', 'py', 'js', 'html', 'css'].includes(ext)) {
      return <FileText size={18} color="#3b82f6" />;
    }
    return <File size={18} color="var(--text-muted)" />;
  };

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-card large" style={{ display: 'flex', flexDirection: 'column', padding: '20px' }}>
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.15)',
              color: 'var(--crimson)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Folder size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                Remote File Transfer & Explorer
              </h3>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                Target: {peerName}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px'
            }}
            title="Close File Explorer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Drives Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 0', overflowX: 'auto' }}>
          <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginRight: 4 }}>
            Drives:
          </span>
          {drives.map((d) => {
            const isSelected = currentPath.toLowerCase().startsWith(d.path.toLowerCase());
            return (
              <button
                key={d.path}
                type="button"
                onClick={() => setCurrentPath(d.path)}
                className="btn-action"
                style={{
                  padding: '5px 10px',
                  background: isSelected ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                  borderColor: isSelected ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-subtle)',
                  color: isSelected ? '#fff' : 'var(--text-muted)'
                }}
              >
                <HardDrive size={14} color={isSelected ? 'var(--crimson)' : 'currentColor'} />
                <span>{d.name || d.path}</span>
              </button>
            );
          })}
        </div>

        {/* Toolbar & Path Address Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '12px' }}>
          <button
            type="button"
            className="btn-action"
            onClick={handleNavigateUp}
            title="Up One Level"
            style={{ padding: '8px' }}
          >
            <ArrowUp size={16} />
          </button>

          <button
            type="button"
            className="btn-action"
            onClick={() => loadDirectory(currentPath)}
            disabled={loading}
            title="Refresh Directory"
            style={{ padding: '8px' }}
          >
            <RefreshCw size={16} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
          </button>

          {/* Path Bar */}
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              type="text"
              value={currentPath}
              onChange={(e) => setCurrentPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') loadDirectory(currentPath);
              }}
              style={{
                width: '100%',
                background: 'rgba(10, 14, 23, 0.65)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 12px',
                color: '#fff',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.84rem',
                outline: 'none'
              }}
            />
          </div>

          {/* Actions: New Folder & Upload */}
          <button
            type="button"
            className="btn-action"
            onClick={() => setNewFolderModal(true)}
            title="Create New Folder"
          >
            <FolderPlus size={15} />
            <span>New Folder</span>
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ padding: '8px 14px', fontSize: '0.84rem' }}
          >
            <Upload size={15} />
            <span>{uploading ? 'Uploading...' : 'Upload'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleUploadSelect}
            style={{ display: 'none' }}
          />
        </div>

        {/* File / Folder Table */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          background: 'rgba(10, 14, 23, 0.45)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          position: 'relative'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{
                position: 'sticky',
                top: 0,
                background: 'rgba(15, 21, 33, 0.95)',
                borderBottom: '1px solid var(--border-subtle)',
                color: 'var(--text-dim)',
                fontSize: '0.74rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                <th style={{ padding: '10px 14px' }}>Name</th>
                <th style={{ padding: '10px 14px', width: '100px' }}>Size</th>
                <th style={{ padding: '10px 14px', width: '150px' }}>Modified</th>
                <th style={{ padding: '10px 14px', width: '90px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr
                  key={item.path}
                  onClick={() => handleItemClick(item)}
                  style={{
                    borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                    cursor: item.is_dir ? 'pointer' : 'default',
                    transition: 'background 0.15s ease'
                  }}
                  className="file-row"
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', color: '#fff' }}>
                    {getFileIcon(item)}
                    <span style={{ fontWeight: item.is_dir ? 600 : 400 }}>{item.name}</span>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    {item.is_dir ? '--' : formatFileSize(item.size)}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-dim)', fontSize: '0.78rem' }}>
                    {item.modified || '--'}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      {!item.is_dir && (
                        <a
                          href={getDownloadUrl(targetBaseUrl, item.path, sessionId)}
                          download={item.name}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            color: 'var(--text-muted)',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            borderRadius: '4px'
                          }}
                          title={`Download ${item.name}`}
                        >
                          <Download size={14} />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteItem(item, e)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-dim)',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          borderRadius: '4px'
                        }}
                        title={`Delete ${item.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && filteredItems.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                    Folder is empty
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* New Folder Modal Subdialog */}
        {newFolderModal && (
          <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="modal-card" style={{ maxWidth: '400px' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 600, color: '#fff' }}>Create New Directory</h4>
              <form onSubmit={handleCreateFolder} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Directory Name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  autoFocus
                  style={{ fontSize: '0.92rem' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn-action"
                    onClick={() => setNewFolderModal(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.86rem' }}>
                    Create
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
