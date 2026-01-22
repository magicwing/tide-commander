/**
 * Constants for the FileExplorerPanel component family
 *
 * Centralized configuration following ClaudeOutputPanel patterns.
 */

import type { GitFileStatusType } from './types';

// ============================================================================
// EXTENSION TO PRISM LANGUAGE MAPPING
// ============================================================================

export const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // Web languages
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'scss',
  '.less': 'css',
  '.html': 'markup',
  '.xml': 'markup',
  '.svg': 'markup',
  '.graphql': 'graphql',
  '.gql': 'graphql',

  // JVM languages
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.scala': 'scala',
  '.groovy': 'groovy',
  '.gradle': 'groovy',
  '.clj': 'clojure',
  '.cljs': 'clojure',

  // C family
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  '.cs': 'csharp',

  // Scripting languages
  '.py': 'python',
  '.rb': 'ruby',
  '.php': 'php',
  '.lua': 'lua',
  '.pl': 'perl',
  '.pm': 'perl',
  '.r': 'r',
  '.R': 'r',

  // Functional languages
  '.hs': 'haskell',
  '.lhs': 'haskell',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.hrl': 'erlang',

  // Systems languages
  '.rs': 'rust',
  '.go': 'go',
  '.swift': 'swift',

  // Shell/scripting
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.fish': 'bash',
  '.ps1': 'powershell',
  '.psm1': 'powershell',
  '.psd1': 'powershell',

  // Data formats
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.conf': 'ini',

  // Documentation
  '.md': 'markdown',
  '.mdx': 'markdown',

  // Database
  '.sql': 'sql',

  // Build/config
  '.dockerfile': 'docker',
  '.nginx': 'nginx',
  '.vim': 'vim',
  '.vimrc': 'vim',
  '.diff': 'diff',
  '.patch': 'diff',
  '.makefile': 'makefile',
  '.mk': 'makefile',
};

// ============================================================================
// FILE ICONS
// ============================================================================

export const FILE_ICONS: Record<string, string> = {
  // Web languages
  '.ts': '📘',
  '.tsx': '⚛️',
  '.js': '📒',
  '.jsx': '⚛️',
  '.css': '🎨',
  '.scss': '🎨',
  '.html': '🌐',

  // JVM languages
  '.java': '☕',
  '.kt': '🟣',
  '.kts': '🟣',
  '.scala': '🔴',
  '.groovy': '🟢',
  '.gradle': '🐘',
  '.clj': '🟢',

  // C family
  '.c': '🔵',
  '.h': '🔵',
  '.cpp': '🔷',
  '.cc': '🔷',
  '.hpp': '🔷',
  '.cs': '🟪',

  // Scripting
  '.py': '🐍',
  '.rb': '💎',
  '.php': '🐘',
  '.lua': '🌙',
  '.pl': '🐪',
  '.r': '📊',
  '.R': '📊',

  // Functional
  '.hs': '🟣',
  '.ex': '💜',
  '.exs': '💜',
  '.erl': '🔴',

  // Systems
  '.rs': '🦀',
  '.go': '🔷',
  '.swift': '🍎',

  // Shell
  '.sh': '💻',
  '.bash': '💻',
  '.ps1': '💠',

  // Data formats
  '.json': '📋',
  '.yaml': '⚙️',
  '.yml': '⚙️',
  '.toml': '⚙️',
  '.ini': '⚙️',

  // Documentation
  '.md': '📝',
  '.mdx': '📝',

  // Database
  '.sql': '🗃️',

  // Config/misc
  '.env': '🔐',
  '.lock': '🔒',
  '.dockerfile': '🐳',
  '.graphql': '💠',
  '.gql': '💠',

  // Images
  '.png': '🖼️',
  '.jpg': '🖼️',
  '.jpeg': '🖼️',
  '.svg': '🖼️',
  '.gif': '🖼️',
  '.webp': '🖼️',

  default: '📄',
};

// ============================================================================
// GIT STATUS CONFIGURATION
// ============================================================================

export interface GitStatusConfig {
  icon: string;
  color: string;
  label: string;
}

export const GIT_STATUS_CONFIG: Record<GitFileStatusType, GitStatusConfig> = {
  modified: { icon: 'M', color: '#ffb86c', label: 'Modified' },
  added: { icon: 'A', color: '#50fa7b', label: 'Added' },
  deleted: { icon: 'D', color: '#ff5555', label: 'Deleted' },
  untracked: { icon: 'U', color: '#8be9fd', label: 'Untracked' },
  renamed: { icon: 'R', color: '#bd93f9', label: 'Renamed' },
};

// ============================================================================
// API CONFIGURATION
// ============================================================================

export const DEFAULT_TREE_DEPTH = 10;
