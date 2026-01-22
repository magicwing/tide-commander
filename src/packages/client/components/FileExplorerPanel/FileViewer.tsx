/**
 * FileViewer - File content viewer with syntax highlighting
 *
 * Displays file content with Prism.js syntax highlighting.
 * Supports text files, images, PDFs, and binary downloads.
 */

import React, { useEffect, useRef, memo } from 'react';
import type { FileViewerProps, FileData } from './types';
import { formatFileSize } from './fileUtils';
import { highlightElement, getLanguageForExtension } from './syntaxHighlighting';

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Header component for file viewer
 */
function FileViewerHeader({
  file,
  rightContent,
  onRevealInTree,
}: {
  file: FileData;
  rightContent?: React.ReactNode;
  onRevealInTree?: (path: string) => void;
}) {
  const language = file.fileType === 'text' ? getLanguageForExtension(file.extension) : file.extension.slice(1).toUpperCase();

  return (
    <div className="file-viewer-header">
      <div className="file-viewer-header-left">
        <span className="file-viewer-filename">{file.filename}</span>
        <span className="file-viewer-meta">
          {formatFileSize(file.size)} • {language}
        </span>
      </div>
      <div className="file-viewer-header-right">
        {onRevealInTree && (
          <button
            className="file-viewer-locate-btn"
            onClick={() => onRevealInTree(file.path)}
            title="Locate in file tree"
          >
            ◎
          </button>
        )}
        {rightContent}
      </div>
    </div>
  );
}

/**
 * Text file viewer with syntax highlighting
 */
function TextFileViewer({ file, onRevealInTree }: { file: FileData; onRevealInTree?: (path: string) => void }) {
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current) {
      highlightElement(codeRef.current);
    }
  }, [file]);

  const language = getLanguageForExtension(file.extension);

  return (
    <>
      <FileViewerHeader file={file} onRevealInTree={onRevealInTree} />
      <div className="file-viewer-code-wrapper">
        <pre className="file-viewer-pre">
          <code ref={codeRef} className={`language-${language}`}>
            {file.content}
          </code>
        </pre>
      </div>
    </>
  );
}

/**
 * Image file viewer
 */
function ImageFileViewer({ file, onRevealInTree }: { file: FileData; onRevealInTree?: (path: string) => void }) {
  const handleDownload = () => {
    if (file.dataUrl) {
      const link = document.createElement('a');
      link.href = file.dataUrl;
      link.download = file.filename;
      link.click();
    }
  };

  return (
    <>
      <FileViewerHeader
        file={file}
        onRevealInTree={onRevealInTree}
        rightContent={
          <button className="file-viewer-download-btn" onClick={handleDownload} title="Download">
            ⬇️ Download
          </button>
        }
      />
      <div className="file-viewer-image-wrapper">
        {file.dataUrl ? (
          <img
            src={file.dataUrl}
            alt={file.filename}
            className="file-viewer-image"
          />
        ) : (
          <div className="file-viewer-placeholder">Failed to load image</div>
        )}
      </div>
    </>
  );
}

/**
 * PDF file viewer
 */
function PdfFileViewer({ file, onRevealInTree }: { file: FileData; onRevealInTree?: (path: string) => void }) {
  const handleDownload = () => {
    if (file.dataUrl) {
      const link = document.createElement('a');
      link.href = file.dataUrl;
      link.download = file.filename;
      link.click();
    }
  };

  return (
    <>
      <FileViewerHeader
        file={file}
        onRevealInTree={onRevealInTree}
        rightContent={
          <button className="file-viewer-download-btn" onClick={handleDownload} title="Download">
            ⬇️ Download
          </button>
        }
      />
      <div className="file-viewer-pdf-wrapper">
        {file.dataUrl ? (
          <iframe
            src={file.dataUrl}
            title={file.filename}
            className="file-viewer-pdf"
          />
        ) : (
          <div className="file-viewer-placeholder">Failed to load PDF</div>
        )}
      </div>
    </>
  );
}

/**
 * Binary file viewer (download only)
 */
function BinaryFileViewer({ file, onRevealInTree }: { file: FileData; onRevealInTree?: (path: string) => void }) {
  const handleDownload = () => {
    if (file.dataUrl) {
      const link = document.createElement('a');
      link.href = file.dataUrl;
      link.download = file.filename;
      link.click();
    }
  };

  // Get icon based on extension
  const getIcon = () => {
    const ext = file.extension.toLowerCase();
    if (['.xlsx', '.xls'].includes(ext)) return '📊';
    if (['.docx', '.doc'].includes(ext)) return '📝';
    if (['.pptx', '.ppt'].includes(ext)) return '📽️';
    if (['.zip', '.tar', '.gz', '.rar', '.7z'].includes(ext)) return '🗜️';
    if (['.mp3', '.wav'].includes(ext)) return '🎵';
    if (['.mp4', '.avi', '.mov', '.mkv'].includes(ext)) return '🎬';
    if (['.exe', '.dmg', '.app'].includes(ext)) return '⚙️';
    return '📁';
  };

  return (
    <>
      <FileViewerHeader file={file} onRevealInTree={onRevealInTree} />
      <div className="file-viewer-binary">
        <div className="file-viewer-binary-icon">{getIcon()}</div>
        <div className="file-viewer-binary-name">{file.filename}</div>
        <div className="file-viewer-binary-size">{formatFileSize(file.size)}</div>
        <div className="file-viewer-binary-message">
          This file type cannot be previewed
        </div>
        <button className="file-viewer-download-btn large" onClick={handleDownload}>
          ⬇️ Download File
        </button>
      </div>
    </>
  );
}

// ============================================================================
// FILE VIEWER COMPONENT
// ============================================================================

function FileViewerComponent({ file, loading, error, onRevealInTree }: FileViewerProps) {
  // Loading state
  if (loading) {
    return <div className="file-viewer-placeholder">Loading...</div>;
  }

  // Error state
  if (error) {
    return <div className="file-viewer-placeholder error">{error}</div>;
  }

  // Empty state
  if (!file) {
    return (
      <div className="file-viewer-placeholder">
        <div className="placeholder-icon">📂</div>
        <div className="placeholder-text">Select a file to view</div>
      </div>
    );
  }

  // Render based on file type
  const fileType = file.fileType || 'text';

  return (
    <div className="file-viewer-content">
      {fileType === 'text' && <TextFileViewer file={file} onRevealInTree={onRevealInTree} />}
      {fileType === 'image' && <ImageFileViewer file={file} onRevealInTree={onRevealInTree} />}
      {fileType === 'pdf' && <PdfFileViewer file={file} onRevealInTree={onRevealInTree} />}
      {fileType === 'binary' && <BinaryFileViewer file={file} onRevealInTree={onRevealInTree} />}
    </div>
  );
}

/**
 * Memoized FileViewer component
 * Prevents unnecessary re-renders when file hasn't changed
 */
export const FileViewer = memo(FileViewerComponent, (prev, next) => {
  // Re-render only if file, loading, or error changed
  if (prev.loading !== next.loading) return false;
  if (prev.error !== next.error) return false;

  // Deep compare file object
  if (prev.file === null && next.file === null) return true;
  if (prev.file === null || next.file === null) return false;

  return (
    prev.file.path === next.file.path &&
    prev.file.content === next.file.content &&
    prev.file.modified === next.file.modified
  );
});

FileViewer.displayName = 'FileViewer';
