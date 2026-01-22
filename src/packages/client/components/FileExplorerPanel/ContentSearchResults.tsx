/**
 * ContentSearchResults - Content search results component
 *
 * Displays results from content/grep-style search showing matching lines.
 */

import React, { memo } from 'react';
import type { ContentSearchResultsProps, ContentMatch } from './types';
import { getFileIcon } from './fileUtils';

// ============================================================================
// HIGHLIGHT MATCH COMPONENT
// ============================================================================

interface HighlightMatchProps {
  text: string;
  query: string;
}

function HighlightMatch({ text, query }: HighlightMatchProps) {
  if (!query) return <>{text}</>;

  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  const index = textLower.indexOf(queryLower);

  if (index === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, index)}
      <mark className="search-highlight">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
}

// ============================================================================
// CONTENT MATCH ITEM
// ============================================================================

interface ContentMatchItemProps {
  match: ContentMatch;
  query: string;
  isSelected: boolean;
  onSelect: (path: string, line?: number) => void;
}

const ContentMatchItem = memo(function ContentMatchItem({
  match,
  query,
  isSelected,
  onSelect,
}: ContentMatchItemProps) {
  // Create a fake TreeNode for the icon
  const iconNode = {
    name: match.name,
    path: match.path,
    isDirectory: false,
    size: 0,
    extension: match.extension,
  };

  return (
    <div className={`content-search-item ${isSelected ? 'selected' : ''}`}>
      <div
        className="content-search-header"
        onClick={() => onSelect(match.path)}
      >
        <span className="content-search-icon">{getFileIcon(iconNode)}</span>
        <span className="content-search-name">{match.name}</span>
        <span className="content-search-count">{match.matches.length} match{match.matches.length > 1 ? 'es' : ''}</span>
      </div>
      <div className="content-search-matches">
        {match.matches.map((m, idx) => (
          <div
            key={`${match.path}-${m.line}-${idx}`}
            className="content-search-match"
            onClick={() => onSelect(match.path, m.line)}
          >
            <span className="content-search-line-num">{m.line}</span>
            <span className="content-search-line-content">
              <HighlightMatch text={m.content} query={query} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

// ============================================================================
// CONTENT SEARCH RESULTS COMPONENT
// ============================================================================

function ContentSearchResultsComponent({
  results,
  onSelect,
  selectedPath,
  query,
}: ContentSearchResultsProps) {
  if (results.length === 0) {
    return <div className="search-no-results">No matches found</div>;
  }

  const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);

  return (
    <div className="content-search-results">
      <div className="content-search-summary">
        {totalMatches} match{totalMatches > 1 ? 'es' : ''} in {results.length} file{results.length > 1 ? 's' : ''}
      </div>
      {results.map((match) => (
        <ContentMatchItem
          key={match.path}
          match={match}
          query={query}
          isSelected={selectedPath === match.path}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

/**
 * Memoized ContentSearchResults component
 */
export const ContentSearchResults = memo(ContentSearchResultsComponent, (prev, next) => {
  if (prev.query !== next.query) return false;
  if (prev.selectedPath !== next.selectedPath) return false;
  if (prev.results.length !== next.results.length) return false;

  for (let i = 0; i < prev.results.length; i++) {
    if (prev.results[i].path !== next.results[i].path) return false;
  }

  return true;
});

ContentSearchResults.displayName = 'ContentSearchResults';
