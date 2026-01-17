import React, { useState, useEffect } from 'react';
import { useStore, store } from '../store';
import { ShortcutConfig, formatShortcut } from '../store/shortcuts';
import { KeyCaptureInput } from './KeyCaptureInput';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Group shortcuts by context for display
const CONTEXT_LABELS: Record<ShortcutConfig['context'], string> = {
  global: 'Global',
  commander: 'Commander View',
  toolbox: 'Toolbox',
};

const CONTEXT_DESCRIPTIONS: Record<ShortcutConfig['context'], string> = {
  global: 'Available everywhere in the application',
  commander: 'Only active when Commander View is open',
  toolbox: 'Only active when Settings panel is open',
};

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const state = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedContext, setExpandedContext] = useState<ShortcutConfig['context'] | 'all'>('all');

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  // Reset search when closing
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filter shortcuts by search query
  const filteredShortcuts = state.shortcuts.filter(shortcut => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      shortcut.name.toLowerCase().includes(query) ||
      shortcut.description.toLowerCase().includes(query) ||
      formatShortcut(shortcut).toLowerCase().includes(query)
    );
  });

  // Group shortcuts by context
  const shortcutsByContext = filteredShortcuts.reduce((acc, shortcut) => {
    if (!acc[shortcut.context]) {
      acc[shortcut.context] = [];
    }
    acc[shortcut.context].push(shortcut);
    return acc;
  }, {} as Record<ShortcutConfig['context'], ShortcutConfig[]>);

  const handleUpdateShortcut = (id: string, updates: { key: string; modifiers: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } }) => {
    store.updateShortcut(id, updates);
  };

  const handleResetAll = () => {
    if (confirm('Reset all keyboard shortcuts to defaults?')) {
      store.resetShortcuts();
    }
  };

  const contexts: ShortcutConfig['context'][] = ['global', 'commander', 'toolbox'];

  return (
    <div className="shortcuts-modal-overlay" onClick={onClose}>
      <div className="shortcuts-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="shortcuts-modal-header">
          <div className="shortcuts-modal-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M18 12h.01M8 16h8" />
            </svg>
            <span>Keyboard Shortcuts</span>
          </div>
          <button className="shortcuts-modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Search and actions */}
        <div className="shortcuts-modal-toolbar">
          <div className="shortcuts-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search shortcuts..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <button className="shortcuts-search-clear" onClick={() => setSearchQuery('')}>
                &times;
              </button>
            )}
          </div>
          <button className="shortcuts-reset-all-btn" onClick={handleResetAll}>
            Reset All
          </button>
        </div>

        {/* Context filter tabs */}
        <div className="shortcuts-context-tabs">
          <button
            className={`shortcuts-context-tab ${expandedContext === 'all' ? 'active' : ''}`}
            onClick={() => setExpandedContext('all')}
          >
            All
            <span className="shortcuts-context-tab-count">{filteredShortcuts.length}</span>
          </button>
          {contexts.map(context => {
            const count = shortcutsByContext[context]?.length || 0;
            return (
              <button
                key={context}
                className={`shortcuts-context-tab ${expandedContext === context ? 'active' : ''}`}
                onClick={() => setExpandedContext(context)}
              >
                {CONTEXT_LABELS[context]}
                <span className="shortcuts-context-tab-count">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Shortcuts list */}
        <div className="shortcuts-modal-content">
          {contexts.map(context => {
            const shortcuts = shortcutsByContext[context] || [];
            if (shortcuts.length === 0) return null;
            if (expandedContext !== 'all' && expandedContext !== context) return null;

            return (
              <div key={context} className="shortcuts-context-group">
                {expandedContext === 'all' && (
                  <div className="shortcuts-context-header">
                    <span className="shortcuts-context-label">{CONTEXT_LABELS[context]}</span>
                    <span className="shortcuts-context-description">{CONTEXT_DESCRIPTIONS[context]}</span>
                  </div>
                )}
                <div className="shortcuts-grid">
                  {shortcuts.map(shortcut => (
                    <div key={shortcut.id} className="shortcut-item">
                      <div className="shortcut-item-info">
                        <span className="shortcut-item-name">{shortcut.name}</span>
                        <span className="shortcut-item-description">{shortcut.description}</span>
                      </div>
                      <KeyCaptureInput
                        shortcut={shortcut}
                        onUpdate={(updates) => handleUpdateShortcut(shortcut.id, updates)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {filteredShortcuts.length === 0 && (
            <div className="shortcuts-empty">
              <p>No shortcuts found for "{searchQuery}"</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shortcuts-modal-footer">
          <span className="shortcuts-modal-hint">
            Click on a shortcut to change it. Press Escape to cancel.
          </span>
        </div>
      </div>
    </div>
  );
}
