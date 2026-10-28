import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactElement } from 'react';
import hljs from 'highlight.js/lib/common';
import { ArrowLeft, Bold, Braces, Check, Code2, Copy, Eye, FileText, FolderCode, Heading2, Image, ImagePlus, Info, Italic, Link2, List, Pencil, Quote, Rows3, Save, Table2, X } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import type { RootState } from '@/store/store';
import { deleteDocument, getDocument, resolveDocumentAsset, updateDocument, updateDocumentInfo, uploadDocumentImage } from '@/api/docs';
import { resolveAssetUrl } from '@/lib/avatar';
import { documents } from './Docs';
import customCodeKeywords from '@/config/codeKeywords.json';
import '@/styles/doc-editor.scss';
import '@/styles/docs-dark.scss';

type EditorMode = 'preview' | 'edit';

const seedMarkdown = (title: string, content: string) => `# ${title}

${content}

## The premise

The future is rarely a single destination. It is a collection of small decisions, repeated with care, until they become a direction.

## Principles

- Make the next step easy to understand.
- Leave room for curiosity and change.
- Let details carry the feeling.

## A note to keep

> Build something useful enough to return to, and beautiful enough to remember.

## Further reading

This document is a living note. Update it as the work moves forward.
`;

function slugify(value: string) {
  return value.toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '');
}

function createHeadingId(label: string, occurrence: number) {
  const base = slugify(label) || 'section';
  return occurrence === 0 ? base : `${base}-${occurrence + 1}`;
}

const languageAliases: Record<string, string> = {
  html: 'xml',
  htm: 'xml',
  jsx: 'javascript',
  tsx: 'javascript',
  vue: 'xml',
  sh: 'bash',
  shell: 'bash',
  yml: 'yaml',
  md: 'markdown',
  rs: 'rust',
  golang: 'go',
  'c++': 'cpp',
};

function parseCodeFenceInfo(value: string, lineCount: number) {
  const annotation = value.trim().match(/^(.*?)\s*\{([^{}]+)\}\s*$/);
  const language = (annotation?.[1] ?? value).trim();
  const highlightedLines = new Set<number>();

  if (!annotation) return { language, highlightedLines };

  for (const entry of annotation[2].split(/[,，]/)) {
    const lineSpec = entry.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!lineSpec) continue;

    const start = Number(lineSpec[1]);
    const end = Number(lineSpec[2] ?? lineSpec[1]);
    if (start < 1 || end < start || start > lineCount) continue;

    for (let line = start; line <= Math.min(end, lineCount); line += 1) {
      highlightedLines.add(line);
    }
  }

  return { language, highlightedLines };
}

type MarkdownFence = { marker: '`' | '~'; length: number; info: string };

function parseFenceOpening(line: string): MarkdownFence | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!match || (match[1][0] === '`' && match[2].includes('`'))) return null;
  return { marker: match[1][0] as MarkdownFence['marker'], length: match[1].length, info: match[2].trim() };
}

function isFenceClosing(line: string, fence: MarkdownFence) {
  const marker = fence.marker === '`' ? '`' : '~';
  return new RegExp(`^ {0,3}${marker}{${fence.length},}[ \\t]*$`).test(line);
}

function highlightCode(line: string, language: string) {
  const expandedLine = line.replace(/\t/g, '  ');
  const normalizedLanguage = language.trim().toLowerCase();
  const languageName = languageAliases[normalizedLanguage] ?? normalizedLanguage;

  try {
    const highlighted = languageName && hljs.getLanguage(languageName)
      ? hljs.highlight(expandedLine, { language: languageName, ignoreIllegals: true }).value
      : hljs.highlightAuto(expandedLine).value;
    const customKeywords = customCodeKeywords[normalizedLanguage as keyof typeof customCodeKeywords] ?? [];
    const keywordPattern = customKeywords.length
      ? new RegExp(`\\b(?:${customKeywords.map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi')
      : null;
    const highlightedWithCustomKeywords = keywordPattern
      ? highlighted.split(/(<[^>]+>)/g).map((part) => (
        part.startsWith('<')
          ? part
          : part.replace(keywordPattern, '<span class="hljs-custom-keyword">$&</span>')
      )).join('')
      : highlighted;
    return <span dangerouslySetInnerHTML={{ __html: highlightedWithCustomKeywords || '&nbsp;' }} />;
  } catch {
    return <span>{expandedLine || ' '}</span>;
  }
}

function renderInlineMarkdown(text: string, onImageClick: (src: string) => void = () => undefined) {
  return text.split(/(!\[[^\]]*\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g).map((part, index) => {
    const image = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (image) {
      const imagePath = image[2].trim();
      const imageSrc = resolveAssetUrl(imagePath.replace(/^src\/assets\/docs-img\//, '/api/assets/docs-img/'));
      return (
        <figure className="doc-markdown-image" key={`${index}-${part}`}>
          <button type="button" className="doc-markdown-image-preview" onClick={() => onImageClick(imageSrc)} aria-label="Preview image">
            <img src={imageSrc} alt={image[1]} loading="lazy" />
          </button>
          {image[1] && <figcaption>{image[1]}</figcaption>}
        </figure>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) return <code key={`${index}-${part}`}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={`${index}-${part}`}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={`${index}-${part}`}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) return <a href={link[2]} key={`${index}-${part}`} target="_blank" rel="noreferrer">{link[1]}</a>;
    return <span key={`${index}-${part}`}>{part}</span>;
  });
}

const CodeBlock = memo(function CodeBlock({ content, language, headerContent, sourceLine, sourceLines }: {
  content: string;
  language: string;
  headerContent?: React.ReactNode;
  sourceLine?: number;
  sourceLines?: number[];
}) {
  const { t } = useTranslation();
  const lines = content.split('\n');
  const { language: codeLanguage, highlightedLines } = parseCodeFenceInfo(language, lines.length);
  const [copied, setCopied] = useState(false);
  const [isScrollReady, setIsScrollReady] = useState(false);
  const [isResettingScroll, setIsResettingScroll] = useState(false);
  const codePreRef = useRef<HTMLPreElement | null>(null);
  const scrollReadyTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (scrollReadyTimerRef.current !== null) {
      window.clearTimeout(scrollReadyTimerRef.current);
    }
  }, []);

  const handlePointerEnter = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || isScrollReady || scrollReadyTimerRef.current !== null) return;
    scrollReadyTimerRef.current = window.setTimeout(() => {
      scrollReadyTimerRef.current = null;
      setIsScrollReady(true);
    }, 500);
  };

  const handlePointerLeave = () => {
    const shouldAnimateReset = isScrollReady || (codePreRef.current?.scrollTop ?? 0) > 0;
    if (scrollReadyTimerRef.current !== null) {
      window.clearTimeout(scrollReadyTimerRef.current);
      scrollReadyTimerRef.current = null;
    }
    if (codePreRef.current) codePreRef.current.scrollTop = 0;
    setIsScrollReady(false);
    if (shouldAnimateReset) setIsResettingScroll(true);
  };

  const copyCode = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copiedWithFallback = document.execCommand('copy');
        textarea.remove();
        if (!copiedWithFallback) throw new Error('Copy command failed');
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      data-source-line={sourceLine}
      className={`doc-code-block${isScrollReady ? ' is-scroll-ready' : ''}${isResettingScroll ? ' is-resetting-scroll' : ''}`}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <div className="doc-code-header">
        {headerContent ?? <span className="doc-code-language">{(codeLanguage || 'text').toLowerCase()}</span>}
        <button type="button" className={`doc-code-copy${copied ? ' is-copied' : ''}`} onClick={copyCode} aria-label={t('docs.copyCode')}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? t('docs.copied') : t('docs.copy')}
        </button>
      </div>
      <pre ref={codePreRef} onAnimationEnd={() => setIsResettingScroll(false)}>
        <code>
          {lines.map((line, index) => (
            <span
              className={`doc-code-line${highlightedLines.has(index + 1) ? ' is-highlighted' : ''}`}
              data-source-line={sourceLines?.[index]}
              key={`${index}-${line}`}
            >
              <span className="doc-code-line-number">{index + 1}</span>
              <span className="doc-code-line-content">{highlightCode(line, codeLanguage)}</span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
});

function CodeTabs({ content, sourceLine }: { content: string; sourceLine?: number }) {
  const { t } = useTranslation();
  const tabs = Array.from(content.matchAll(/:::\s*([^\n]+)\n```([^\n]*)\n([\s\S]*?)```\s*:::/g))
    .map((match) => ({
      label: match[1].trim(),
      language: match[2].trim(),
      content: match[3].replace(/^\n/, '').replace(/\n$/, ''),
    }));
  const [activeTab, setActiveTab] = useState(0);

  if (!tabs.length) return null;
  const active = tabs[Math.min(activeTab, tabs.length - 1)];

  return (
    <div className="doc-code-tabs" data-source-line={sourceLine}>
      <CodeBlock
        content={active.content}
        language={active.language}
        sourceLine={sourceLine}
        headerContent={(
          <div className="doc-code-tab-list" role="tablist" aria-label={t('docs.codeFiles')}>
            {tabs.map((tab, index) => (
              <button
                type="button"
                className={`doc-code-tab${index === activeTab ? ' is-active' : ''}`}
                role="tab"
                aria-selected={index === activeTab}
                key={`${tab.label}-${index}`}
                onClick={() => setActiveTab(index)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      />
    </div>
  );
}

function MarkdownTable({ lines, sourceLine }: { lines: string[]; sourceLine?: number }) {
  const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
  const headers = cells(lines[0]);
  const rows = lines.slice(2).map(cells);

  return (
    <div className="doc-markdown-table-wrap" data-source-line={sourceLine}>
      <table className="doc-markdown-table">
        <thead><tr>{headers.map((cell, index) => <th key={`${cell}-${index}`}>{renderInlineMarkdown(cell, () => undefined)}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {headers.map((_, index) => <td key={`${rowIndex}-${index}`}>{renderInlineMarkdown(row[index] ?? '', () => undefined)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoxTable({ lines, sourceLine }: { lines: string[]; sourceLine?: number }) {
  const rows = lines
    .filter((line) => line.startsWith('│'))
    .map((line) => line.slice(1, -1).split('│').map((cell) => cell.trim()));
  const headers = rows[0] ?? [];

  return (
    <div className="doc-markdown-table-wrap" data-source-line={sourceLine}>
      <table className="doc-markdown-table">
        <thead><tr>{headers.map((cell, index) => <th key={`${cell}-${index}`}>{renderInlineMarkdown(cell, () => undefined)}</th>)}</tr></thead>
        <tbody>
          {rows.slice(1).map((row, rowIndex) => (
            <tr key={rowIndex}>
              {headers.map((_, index) => <td key={`${rowIndex}-${index}`}>{renderInlineMarkdown(row[index] ?? '', () => undefined)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function separateMarkdownTables(markdown: string) {
  const lines = markdown.split('\n');
  const result: string[] = [];
  const sourceLineIndices: number[] = [];
  let fence: MarkdownFence | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (fence) {
      result.push(line);
      sourceLineIndices.push(index);
      if (isFenceClosing(line, fence)) fence = null;
      continue;
    }
    const openingFence = parseFenceOpening(line);
    if (openingFence) {
      fence = openingFence;
      result.push(line);
      sourceLineIndices.push(index);
      continue;
    }
    if (line.startsWith('┌')) {
      if (result.length && result[result.length - 1] !== '') {
        result.push('');
        sourceLineIndices.push(-1);
      }
      result.push(line);
      sourceLineIndices.push(index);
      while (index + 1 < lines.length) {
        index += 1;
        result.push(lines[index]);
        sourceLineIndices.push(index);
        if (lines[index].startsWith('└')) break;
      }
      if (index + 1 < lines.length && lines[index + 1] !== '') {
        result.push('');
        sourceLineIndices.push(-1);
      }
      continue;
    }
    const separator = lines[index + 1];
    const isTableStart = line.includes('|')
      && Boolean(separator && /^\s*\|?[\s:-]+(\|[\s:-]+)+\|?\s*$/.test(separator));

    if (isTableStart && result.length && result[result.length - 1] !== '') {
      result.push('');
      sourceLineIndices.push(-1);
    }
    result.push(line);
    sourceLineIndices.push(index);

    if (isTableStart) {
      index += 1;
      result.push(lines[index]);
      sourceLineIndices.push(index);
      while (index + 1 < lines.length && lines[index + 1].includes('|')) {
        index += 1;
        result.push(lines[index]);
        sourceLineIndices.push(index);
      }
      if (index + 1 < lines.length && lines[index + 1] !== '') {
        result.push('');
        sourceLineIndices.push(-1);
      }
    }
  }

  return { text: result.join('\n'), sourceLineIndices };
}

function renderMarkdown(markdown: string, onImageClick: (src: string) => void) {
  const separatedMarkdown = separateMarkdownTables(markdown);
  const separatedLines = separatedMarkdown.text.split('\n');
  const mappedMarkdown = separatedLines.reduce<{
    lines: string[];
    sourceLineIndices: number[];
    fence: MarkdownFence | null;
  }>((state, line, index) => {
      const sourceLineIndex = separatedMarkdown.sourceLineIndices[index] ?? -1;
      const previous = separatedLines[index - 1] ?? '';
      const next = separatedLines[index + 1] ?? '';
      const openingFence = state.fence ? null : parseFenceOpening(line);
      const isInsideFence = Boolean(state.fence);
      const isHeading = !isInsideFence && /^#{1,3}\s+/.test(line);
      const isListItem = !isInsideFence && /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line);
      const previousIsListItem = /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(previous);
      const nextIsListItem = /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(next);
      if (line.trim() && previous.trim() && (isHeading || (isListItem && !previousIsListItem))) {
        state.lines.push('');
        state.sourceLineIndices.push(-1);
      }
      state.lines.push(line);
      state.sourceLineIndices.push(sourceLineIndex);
      // Treat standalone Markdown blocks as boundaries even when the author
      // did not add a blank line after them.
      if (line.trim() && next.trim() && (
        isHeading
        || (isListItem && !nextIsListItem)
      )) {
        state.lines.push('');
        state.sourceLineIndices.push(-1);
      }
      if (state.fence && isFenceClosing(line, state.fence)) state.fence = null;
      else if (openingFence) state.fence = openingFence;
      return state;
    }, { lines: [], sourceLineIndices: [], fence: null });
  const mappedText = mappedMarkdown.lines.join('\n');
  const blocks: Array<{ text: string; startOffset: number }> = [];
  const addPlainBlocks = (start: number, end: number) => {
    const boundaries = /\n{2,}/g;
    boundaries.lastIndex = start;
    let blockStart = start;
    let boundary = boundaries.exec(mappedText);
    while (boundary && boundary.index < end) {
      blocks.push({ text: mappedText.slice(blockStart, boundary.index), startOffset: blockStart });
      blockStart = boundaries.lastIndex;
      boundary = boundaries.exec(mappedText);
    }
    blocks.push({ text: mappedText.slice(blockStart, end), startOffset: blockStart });
  };
  const lineOffsets = [0];
  for (let index = 0; index < mappedText.length; index += 1) {
    if (mappedText[index] === '\n') lineOffsets.push(index + 1);
  }
  const specialBlockRanges: Array<{ start: number; end: number }> = [];
  let fence: MarkdownFence | null = null;
  let fenceStart = -1;
  let codeTabsStart = -1;
  for (let lineIndex = 0; lineIndex < lineOffsets.length; lineIndex += 1) {
    const start = lineOffsets[lineIndex];
    const end = lineIndex + 1 < lineOffsets.length ? lineOffsets[lineIndex + 1] - 1 : mappedText.length;
    const line = mappedText.slice(start, end);
    if (fence) {
      if (isFenceClosing(line, fence)) {
        specialBlockRanges.push({ start: fenceStart, end });
        fence = null;
        fenceStart = -1;
      }
      continue;
    }
    if (codeTabsStart >= 0) {
      if (line.startsWith('::::')) {
        specialBlockRanges.push({ start: codeTabsStart, end });
        codeTabsStart = -1;
      }
      continue;
    }
    if (line.startsWith('::::')) {
      codeTabsStart = start;
      continue;
    }
    const openingFence = parseFenceOpening(line);
    if (openingFence) {
      fence = openingFence;
      fenceStart = start;
    }
  }
  if (fenceStart >= 0) specialBlockRanges.push({ start: fenceStart, end: mappedText.length });
  if (codeTabsStart >= 0) specialBlockRanges.push({ start: codeTabsStart, end: mappedText.length });

  let segmentStart = 0;
  for (const range of specialBlockRanges) {
    addPlainBlocks(segmentStart, range.start);
    blocks.push({ text: mappedText.slice(range.start, range.end), startOffset: range.start });
    segmentStart = range.end;
  }
  addPlainBlocks(segmentStart, mappedText.length);

  const mappedLineOffsets = [0];
  for (let index = 0; index < mappedText.length; index += 1) {
    if (mappedText[index] === '\n') mappedLineOffsets.push(index + 1);
  }
  const mappedLineAtOffset = (offset: number) => {
    let low = 0;
    let high = mappedLineOffsets.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (mappedLineOffsets[middle] <= offset) low = middle + 1;
      else high = middle;
    }
    return Math.max(0, low - 1);
  };
  const nonEmptyBlocks = blocks.filter(({ text }) => text.trim());
  const headingOccurrences = new Map<string, number>();

  return nonEmptyBlocks.map(({ text: block, startOffset }, index) => {
    const lines = block.split('\n');
    const first = lines[0];
    const mappedBlockStart = mappedLineAtOffset(startOffset);
    const blockSourceLines = lines.map((_, lineIndex) => (
      mappedMarkdown.sourceLineIndices[mappedBlockStart + lineIndex] ?? -1
    ));
    const sourceLineIndex = blockSourceLines.find((lineIndex) => lineIndex >= 0) ?? 0;
    let renderedBlock: ReactElement;
    const openingFence = parseFenceOpening(first);

    if (block.startsWith('::::') && block.endsWith('::::')) {
      renderedBlock = <CodeTabs key={index} content={block.slice(4, -4).trim()} sourceLine={sourceLineIndex} />;
    } else if (openingFence && isFenceClosing(lines[lines.length - 1], openingFence)) {
      renderedBlock = <CodeBlock
        key={index}
        language={openingFence.info}
        content={lines.slice(1, -1).join('\n')}
        sourceLine={sourceLineIndex}
        sourceLines={blockSourceLines.slice(1, -1)}
      />;
    } else if (first.startsWith('┌') && lines.some((line) => line.startsWith('└'))) {
      renderedBlock = <BoxTable key={index} lines={lines} sourceLine={sourceLineIndex} />;
    } else if (lines.length >= 2 && lines[0].includes('|') && /^\s*\|?[\s:-]+(\|[\s:-]+)+\|?\s*$/.test(lines[1])) {
      renderedBlock = <MarkdownTable key={index} lines={lines} sourceLine={sourceLineIndex} />;
    } else {
      const headingLevel = first.match(/^(#{1,3}) /)?.[1].length;
      const headingLabel = headingLevel ? first.slice(headingLevel + 1) : '';
      const headingOccurrence = headingLabel ? headingOccurrences.get(headingLabel) ?? 0 : 0;
      if (headingLabel) headingOccurrences.set(headingLabel, headingOccurrence + 1);
      if (headingLevel === 1) {
        renderedBlock = <h1 data-source-line={sourceLineIndex} id={createHeadingId(headingLabel, headingOccurrence)} key={index}>{headingLabel}</h1>;
      } else if (headingLevel === 2) {
        renderedBlock = <h2 data-source-line={sourceLineIndex} id={createHeadingId(headingLabel, headingOccurrence)} key={index}>{headingLabel}</h2>;
      } else if (headingLevel === 3) {
        renderedBlock = <h3 data-source-line={sourceLineIndex} id={createHeadingId(headingLabel, headingOccurrence)} key={index}>{headingLabel}</h3>;
      } else {
        const unorderedItems = lines.map((line) => line.match(/^\s*[-*+]\s+(.+)$/)?.[1]);
        const orderedItems = lines.map((line) => line.match(/^\s*\d+[.)]\s+(.+)$/)?.[1]);
        if (unorderedItems.every((item): item is string => Boolean(item))) {
          renderedBlock = <ul key={index}>{unorderedItems.map((item, itemIndex) => (
            <li data-source-line={blockSourceLines[itemIndex]} key={`${index}-${itemIndex}`}>{renderInlineMarkdown(item, onImageClick)}</li>
          ))}</ul>;
        } else if (orderedItems.every((item): item is string => Boolean(item))) {
          renderedBlock = <ol key={index}>{orderedItems.map((item, itemIndex) => (
            <li data-source-line={blockSourceLines[itemIndex]} key={`${index}-${itemIndex}`}>{renderInlineMarkdown(item, onImageClick)}</li>
          ))}</ol>;
        } else if (first.startsWith('> ')) {
          renderedBlock = <blockquote data-source-line={sourceLineIndex} key={index}>{renderInlineMarkdown(first.slice(2), onImageClick)}</blockquote>;
        } else {
          renderedBlock = (
            <p data-source-line={sourceLineIndex} key={index}>
              {lines.map((line, lineIndex) => (
                <span data-source-line={blockSourceLines[lineIndex]} key={`${index}-${lineIndex}`}>
                  {lineIndex > 0 && <br />}{renderInlineMarkdown(line, onImageClick)}
                </span>
              ))}
            </p>
          );
        }
      }
    }

    return renderedBlock;
  });
}

export default function DocEditor() {
  const { t } = useTranslation();
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isLibraryDocument = new URLSearchParams(location.search).get('from') === 'library';
  const docsReturnParams = new URLSearchParams(location.search);
  docsReturnParams.set('view', isLibraryDocument ? 'library' : 'list');
  docsReturnParams.delete('from');
  const docsReturnUrl = `/docs?${docsReturnParams.toString()}`;
  const document = documents.find((item) => item.id === id) ?? documents[0];
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const documentId = id ?? document.id;
  const storageKey = `lume-doc-markdown-${documentId}`;
  const [remoteTitle, setRemoteTitle] = useState('');
  const [remoteCategory, setRemoteCategory] = useState('');
  const [remotePublic, setRemotePublic] = useState(false);
  const [remoteCover, setRemoteCover] = useState<string | undefined>();
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [imageUploadError, setImageUploadError] = useState('');
  const [isImageDropActive, setIsImageDropActive] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoTab, setInfoTab] = useState<'detail' | 'delete'>('detail');
  const [infoTitle, setInfoTitle] = useState('');
  const [infoCategory, setInfoCategory] = useState('');
  const [infoPublic, setInfoPublic] = useState(false);
  const [infoCover, setInfoCover] = useState<File | null>(null);
  const [infoCoverPreview, setInfoCoverPreview] = useState('');
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoDeleting, setInfoDeleting] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [mode, setMode] = useState<EditorMode>(() => (
    !isLibraryDocument && (location.state as { startInEdit?: boolean } | null)?.startInEdit ? 'edit' : 'preview'
  ));
  const [activeHeading, setActiveHeading] = useState('');
  const [markdown, setMarkdown] = useState(() => localStorage.getItem(storageKey) || seedMarkdown(document.title, document.content));
  const deferredMarkdown = useDeferredValue(markdown);
  const [pendingScrollSync, setPendingScrollSync] = useState<{
    lineIndex: number;
    viewportTop: number;
  } | null>(null);
  const outlineScrollLockRef = useRef('');
  const outlineScrollTimerRef = useRef<number | null>(null);
  const [savedAt, setSavedAt] = useState(() => Boolean(localStorage.getItem(storageKey)));
  const [isSaving, setIsSaving] = useState(false);
  const [remoteLoaded, setRemoteLoaded] = useState(() => !Boolean(currentUser && id && !documents.some((item) => item.id === id)));
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const editorMirrorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageRenameMapRef = useRef<Record<string, string>>({});
  const [imageNameDrafts, setImageNameDrafts] = useState<Record<string, string>>({});
  const previewRef = useRef<HTMLElement>(null);
  const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const displayTitle = remoteTitle || document.title;
  const isRemoteDocument = Boolean(currentUser && id && !documents.some((item) => item.id === id));
  const previewContent = useMemo(() => renderMarkdown(deferredMarkdown, setImagePreviewUrl), [deferredMarkdown]);
  const outline = useMemo(() => {
    const headingOccurrences = new Map<string, number>();
    let fence: MarkdownFence | null = null;
    return deferredMarkdown.split('\n').flatMap((line, lineIndex) => {
      if (fence) {
        if (isFenceClosing(line, fence)) fence = null;
        return [];
      }
      const openingFence = parseFenceOpening(line);
      if (openingFence) {
        fence = openingFence;
        return [];
      }
      if (/^::::/.test(line.trim()) || /^:::/.test(line.trim()) || !/^#{1,3} /.test(line)) return [];
      const level = line.match(/^#+/)?.[0].length ?? 1;
      const label = line.slice(level + 1);
      const occurrence = headingOccurrences.get(label) ?? 0;
      headingOccurrences.set(label, occurrence + 1);
      return [{ label, id: createHeadingId(label, occurrence), level, lineIndex }];
    });
  }, [deferredMarkdown]);
  const outlineByLine = useMemo(
    () => new Map(outline.map((heading) => [heading.lineIndex, heading])),
    [outline],
  );
  const editorMirrorLines = useMemo(
    () => deferredMarkdown.split('\n').map((line, lineIndex) => {
      const heading = outlineByLine.get(lineIndex);
      return <span className="doc-markdown-editor-mirror-line" data-heading-id={heading?.id} data-line-index={lineIndex} key={lineIndex}>{line || ' '}</span>;
    }),
    [deferredMarkdown, outlineByLine],
  );
  const documentImages = useMemo(
    () => Array.from(deferredMarkdown.matchAll(/!\[[^\]]*\]\((src\/assets\/docs-img\/[^)\s]+)\)/g), (match) => match[1]),
    [deferredMarkdown],
  );

  const saveDocument = useCallback(() => {
    const contentToSave = markdown;
    const imageRenamesToSave = { ...imageRenameMapRef.current };
    const save = async () => {
      localStorage.setItem(storageKey, contentToSave);
      if (!isRemoteDocument) {
        setSavedAt(true);
        return true;
      }
      setIsSaving(true);
      try {
        await updateDocument(
          id!,
          contentToSave,
          Object.entries(imageRenamesToSave).map(([from, to]) => ({
            from: from.slice(from.lastIndexOf('/') + 1),
            to: to.slice(to.lastIndexOf('/') + 1),
          })),
        );
        for (const [from, to] of Object.entries(imageRenamesToSave)) {
          if (imageRenameMapRef.current[from] === to) delete imageRenameMapRef.current[from];
        }
        setSavedAt(true);
        return true;
      } catch {
        setSavedAt(false);
        return false;
      } finally {
        setIsSaving(false);
      }
    };

    const queuedSave = saveQueueRef.current.then(save, save);
    saveQueueRef.current = queuedSave;
    return queuedSave;
  }, [id, isRemoteDocument, markdown, storageKey]);

  useEffect(() => {
    if (!currentUser || !id || documents.some((item) => item.id === id)) return;
    let cancelled = false;
    getDocument(id).then((remote) => {
      if (cancelled) return;
      setRemoteTitle(remote.title);
      setRemoteCategory(remote.category);
      setRemotePublic(remote.public === true);
      setRemoteCover(resolveDocumentAsset(remote.cover, Date.now()));
      const localDraft = localStorage.getItem(storageKey);
      setMarkdown(localDraft ?? remote.content);
      setSavedAt(Boolean(localDraft) || Boolean(remote.content));
      setRemoteLoaded(true);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [currentUser?.id, id, storageKey]);

  useEffect(() => {
    if (isRemoteDocument && !remoteLoaded) return;
    const timer = window.setTimeout(() => { void saveDocument(); }, 450);
    return () => window.clearTimeout(timer);
  }, [isRemoteDocument, remoteLoaded, saveDocument]);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || mode !== 'edit') return;
    editor.style.height = 'auto';
    const nextHeight = `${editor.scrollHeight}px`;
    if (editor.style.height !== nextHeight) editor.style.height = nextHeight;
  }, [markdown, mode]);

  useEffect(() => {
    const preview = previewRef.current;
    const editorMirror = editorMirrorRef.current;
    if (!preview || !editorMirror) return;
    const headings = mode === 'preview'
      ? Array.from(preview.querySelectorAll<HTMLElement>('h1, h2, h3'))
      : Array.from(editorMirror.querySelectorAll<HTMLElement>('[data-heading-id]'));
    const updateActiveHeading = () => {
      if (outlineScrollLockRef.current) return;
      const activationLine = window.innerHeight / 2;
      const current = headings.reduce<HTMLElement | null>((last, heading) => (
        heading.getBoundingClientRect().top <= activationLine ? heading : last
      ), headings[0] ?? null);
      const headingId = current?.id || current?.dataset.headingId;
      if (headingId) setActiveHeading(headingId);
    };
    const finishOutlineScroll = () => {
      if (outlineScrollTimerRef.current !== null) {
        window.clearTimeout(outlineScrollTimerRef.current);
        outlineScrollTimerRef.current = null;
      }
      outlineScrollLockRef.current = '';
      updateActiveHeading();
    };
    const handleScroll = () => {
      if (!outlineScrollLockRef.current) {
        updateActiveHeading();
        return;
      }
      if (outlineScrollTimerRef.current !== null) window.clearTimeout(outlineScrollTimerRef.current);
      outlineScrollTimerRef.current = window.setTimeout(finishOutlineScroll, 180);
    };
    updateActiveHeading();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('scrollend', finishOutlineScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scrollend', finishOutlineScroll);
      if (outlineScrollTimerRef.current !== null) {
        window.clearTimeout(outlineScrollTimerRef.current);
        outlineScrollTimerRef.current = null;
      }
      outlineScrollLockRef.current = '';
    };
  }, [deferredMarkdown, mode]);

  useLayoutEffect(() => {
    if (!pendingScrollSync || deferredMarkdown !== markdown) return;
    const root = mode === 'preview' ? previewRef.current : editorMirrorRef.current;
    const lineKey = mode === 'preview' ? 'sourceLine' : 'lineIndex';
    const lineAttribute = mode === 'preview' ? 'data-source-line' : 'data-line-index';
    const candidates = Array.from(root?.querySelectorAll<HTMLElement>(`[${lineAttribute}]`) ?? [])
      .filter((element) => Number(element.dataset[lineKey]) >= 0);
    const exactTargets = candidates.filter((element) => (
      Number(element.dataset[lineKey]) === pendingScrollSync.lineIndex
    ));
    const targetPool = exactTargets.length ? exactTargets : candidates;
    const target = targetPool.reduce<HTMLElement | null>((closest, element) => {
      if (!closest) return element;
      const elementLine = Number(element.dataset[lineKey]);
      const closestLine = Number(closest.dataset[lineKey]);
      const elementDistance = Math.abs(elementLine - pendingScrollSync.lineIndex);
      const closestDistance = Math.abs(closestLine - pendingScrollSync.lineIndex);
      if (elementDistance !== closestDistance) return elementDistance < closestDistance ? element : closest;
      return Math.abs(element.getBoundingClientRect().top - pendingScrollSync.viewportTop)
        < Math.abs(closest.getBoundingClientRect().top - pendingScrollSync.viewportTop) ? element : closest;
    }, null);
    if (target) {
      const scrollRoot = window.document.scrollingElement ?? window.document.documentElement;
      const delta = target.getBoundingClientRect().top - pendingScrollSync.viewportTop;
      if (Math.abs(delta) > 1) {
        scrollRoot.scrollTo({ top: scrollRoot.scrollTop + delta, behavior: 'instant' });
      }
      if (mode === 'edit') {
        const lineStart = markdown.split('\n').slice(0, pendingScrollSync.lineIndex).join('\n').length
          + (pendingScrollSync.lineIndex > 0 ? 1 : 0);
        editorRef.current?.setSelectionRange(lineStart, lineStart);
        editorRef.current?.focus({ preventScroll: true });
      }
    }
    setPendingScrollSync(null);
  }, [deferredMarkdown, markdown, mode, pendingScrollSync]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveDocument();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saveDocument]);

  const insertMarkdown = (before: string, after = '', placeholder = 'text') => {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = markdown.slice(start, end) || placeholder;
    const next = `${markdown.slice(0, start)}${before}${selected}${after}${markdown.slice(end)}`;
    setMarkdown(next);
    setSavedAt(false);
    requestAnimationFrame(() => {
      editor.focus();
      const cursor = start + before.length + selected.length + after.length;
      editor.setSelectionRange(cursor, cursor);
    });
  };

  const insertAtSelection = (text: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const next = `${markdown.slice(0, start)}${text}${markdown.slice(end)}`;
    setMarkdown(next);
    setSavedAt(false);
    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const uploadAndInsertImages = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (!imageFiles.length) return;
    if (!id || !isRemoteDocument) {
      setImageUploadError('Save this document to your account before uploading images.');
      return;
    }
    setImageUploadError('');
    try {
      const uploaded = await Promise.all(imageFiles.map((file) => uploadDocumentImage(id, file)));
      insertAtSelection(uploaded.map((item) => `![](${item.path})`).join('\n\n'));
    } catch {
      setImageUploadError('Image upload failed. Please try again.');
    }
  };

  const handleEditorPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file && file.type.startsWith('image/')));
    if (!files.length) return;
    event.preventDefault();
    void uploadAndInsertImages(files);
  };

  const handleEditorDrop = (event: React.DragEvent<HTMLTextAreaElement>) => {
    const files = event.dataTransfer.files;
    if (!Array.from(files).some((file) => file.type.startsWith('image/'))) return;
    event.preventDefault();
    setIsImageDropActive(false);
    void uploadAndInsertImages(files);
  };

  const renameDocumentImage = (oldPath: string, nextName: string) => {
    const cleanName = nextName.trim().replace(/[^a-zA-Z0-9._-]/g, '');
    const currentName = oldPath.slice(oldPath.lastIndexOf('/') + 1);
    const nextPath = `${oldPath.slice(0, oldPath.lastIndexOf('/') + 1)}${cleanName}`;
    if (!cleanName || !cleanName.endsWith('.webp') || (nextPath !== oldPath && documentImages.includes(nextPath))) {
      setImageNameDrafts((drafts) => ({ ...drafts, [oldPath]: currentName }));
      return;
    }
    const renameMap = imageRenameMapRef.current;
    const originalPath = Object.keys(renameMap).find((path) => renameMap[path] === oldPath) ?? oldPath;
    renameMap[originalPath] = nextPath;
    setImageNameDrafts((drafts) => {
      const nextDrafts = { ...drafts };
      delete nextDrafts[oldPath];
      nextDrafts[nextPath] = cleanName;
      return nextDrafts;
    });
    setMarkdown((value) => value.split(oldPath).join(nextPath));
    setSavedAt(false);
  };

  const openInfo = () => {
    setInfoTitle(remoteTitle || document.title);
    setInfoCategory(remoteCategory || document.category);
    setInfoPublic(remotePublic);
    setInfoCover(null);
    setInfoCoverPreview(remoteCover || document.cover);
    setInfoTab('detail');
    setInfoError('');
    setInfoOpen(true);
  };

  const removeDocument = async () => {
    if (!id || infoDeleting) return;
    setInfoDeleting(true);
    setInfoError('');
    try {
      await deleteDocument(id);
      navigate('/docs', { replace: true });
    } catch {
      setInfoError(t('docs.deleteFailed'));
      setInfoDeleting(false);
    }
  };

  const saveInfo = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!id || documents.some((item) => item.id === id) || !infoTitle.trim() || !infoCategory.trim() || infoSaving) return;
    setInfoSaving(true);
    try {
      const updated = await updateDocumentInfo(id, { title: infoTitle.trim(), category: infoCategory.trim(), cover: infoCover, public: infoPublic });
      setRemoteTitle(updated.title);
      setRemoteCategory(updated.category);
      setInfoPublic(updated.public === true);
      setRemoteCover(resolveDocumentAsset(updated.cover, Date.now()));
      setInfoOpen(false);
    } finally {
      setInfoSaving(false);
    }
  };

  const insertCodeBlock = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = markdown.slice(start, end) || 'const future = true;';
    const beforeContent = markdown.slice(0, start);
    const afterContent = markdown.slice(end);
    const prefix = beforeContent.length === 0
      ? ''
      : beforeContent.endsWith('\n\n')
        ? ''
        : beforeContent.endsWith('\n')
          ? '\n'
          : '\n\n';
    const suffix = afterContent.length === 0
      ? ''
      : afterContent.startsWith('\n\n')
        ? ''
        : afterContent.startsWith('\n')
          ? '\n'
          : '\n\n';
    const before = `${prefix}\`\`\`js\n`;
    const after = `\n\`\`\`${suffix}`;
    const next = `${beforeContent}${before}${selected}${after}${afterContent}`;
    setMarkdown(next);
    setSavedAt(false);
    requestAnimationFrame(() => {
      editor.focus();
      const cursor = start + before.length + selected.length + after.length;
      editor.setSelectionRange(cursor, cursor);
    });
  };

  const insertCodeTabs = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = markdown.slice(start, end) || 'const pi = 3.14;';
    const beforeContent = markdown.slice(0, start);
    const afterContent = markdown.slice(end);
    const prefix = beforeContent.length === 0
      ? ''
      : beforeContent.endsWith('\n\n')
        ? ''
        : beforeContent.endsWith('\n')
          ? '\n'
          : '\n\n';
    const suffix = afterContent.length === 0
      ? ''
      : afterContent.startsWith('\n\n')
        ? ''
        : afterContent.startsWith('\n')
          ? '\n'
          : '\n\n';
    const codeTabs = `::::
::: index.html
\`\`\`html
\`\`\`
:::
::: style.css
\`\`\`css
\`\`\`
:::
::::`;
    const next = `${beforeContent}${prefix}${codeTabs}${suffix}${afterContent}`;
    setMarkdown(next);
    setSavedAt(false);
    requestAnimationFrame(() => {
      editor.focus();
      const cursor = start + prefix.length + codeTabs.indexOf(selected) + selected.length;
      editor.setSelectionRange(cursor, cursor);
    });
  };

  const insertTable = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const table = `| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
| Value | Value | Value |`;
    const next = `${markdown.slice(0, start)}${table}${markdown.slice(end)}`;
    setMarkdown(next);
    setSavedAt(false);
    requestAnimationFrame(() => {
      editor.focus();
      const cursor = start + table.length;
      editor.setSelectionRange(cursor, cursor);
    });
  };

  const insertUnicodeTable = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const table = `┌────────┬─────────────────┬──────────────┐
│  方法   │      路径       │     功能      │
├────────┼─────────────────┼──────────────┤
│ POST   │  /api/register  │     注册      │
├────────┼─────────────────┼──────────────┤
│ POST   │  /api/login     │     登录      │
└────────┴─────────────────┴──────────────┘`;
    const next = `${markdown.slice(0, start)}${table}${markdown.slice(end)}`;
    setMarkdown(next);
    setSavedAt(false);
    requestAnimationFrame(() => {
      editor.focus();
      const cursor = start + table.length;
      editor.setSelectionRange(cursor, cursor);
    });
  };

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && ['l', 'n', 't', 'w'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.stopPropagation();
      window.document.execCommand(event.shiftKey ? 'redo' : 'undo');
      return;
    }
    if (event.key !== 'Tab') return;

    event.preventDefault();
    event.stopPropagation();
    const editor = event.currentTarget;
    const pageScrollX = window.scrollX;
    const pageScrollY = window.scrollY;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const indent = '    ';

    // With no selection, Tab behaves like a literal four-space insertion
    // instead of unexpectedly re-indenting the whole current line.
    if (start === end && !event.shiftKey) {
      const next = `${markdown.slice(0, start)}${indent}${markdown.slice(end)}`;
      setMarkdown(next);
      setSavedAt(false);
      requestAnimationFrame(() => {
        editor.focus();
        editor.setSelectionRange(start + indent.length, start + indent.length);
        window.scrollTo(pageScrollX, pageScrollY);
      });
      return;
    }

    const lineStart = markdown.lastIndexOf('\n', start - 1) + 1;
    const selectedEnd = end > start && markdown[end - 1] === '\n' ? end - 1 : end;
    const lineEnd = markdown.indexOf('\n', selectedEnd);
    const rangeEnd = lineEnd === -1 ? markdown.length : lineEnd;
    const selectedLines = markdown.slice(lineStart, rangeEnd);
    const lines = selectedLines.split('\n');
    const nextLines = event.shiftKey
      ? lines.map((line) => line.startsWith(indent) ? line.slice(indent.length) : line)
      : lines.map((line) => `${indent}${line}`);
    const replacement = nextLines.join('\n');
    const next = `${markdown.slice(0, lineStart)}${replacement}${markdown.slice(rangeEnd)}`;
    const offset = event.shiftKey
      ? lines.reduce((total, line) => total + (line.startsWith(indent) ? indent.length : 0), 0)
      : lines.length * indent.length;
    setMarkdown(next);
    setSavedAt(false);
    requestAnimationFrame(() => {
      editor.focus();
      const nextStart = event.shiftKey ? Math.max(lineStart, start - Math.min(offset, start - lineStart)) : start + indent.length;
      const nextEnd = end > start
        ? (event.shiftKey ? Math.max(nextStart, end - offset) : end + offset)
        : nextStart;
      editor.setSelectionRange(nextStart, nextEnd);
      window.scrollTo(pageScrollX, pageScrollY);
    });
  };

  const switchMode = (nextMode: EditorMode) => {
    if (nextMode === mode) return;
    const sourceElements = mode === 'preview'
      ? Array.from(previewRef.current?.querySelectorAll<HTMLElement>('[data-source-line]') ?? [])
      : Array.from(editorMirrorRef.current?.querySelectorAll<HTMLElement>('[data-line-index]') ?? []);
    const anchorTop = window.innerHeight / 2;
    const lineKey = mode === 'preview' ? 'sourceLine' : 'lineIndex';
    const validSourceElements = sourceElements.filter((element) => {
      const line = Number(element.dataset[lineKey]);
      return Number.isInteger(line) && line >= 0;
    });
    const visibleSource = validSourceElements.reduce<HTMLElement | null>((current, element) => (
      element.getBoundingClientRect().top <= anchorTop ? element : current
    ), null) ?? validSourceElements[0] ?? null;
    const lineIndex = Number(mode === 'preview'
      ? visibleSource?.dataset.sourceLine
      : visibleSource?.dataset.lineIndex);
    if (visibleSource && Number.isFinite(lineIndex)) {
      setPendingScrollSync({
        lineIndex,
        viewportTop: visibleSource.getBoundingClientRect().top,
      });
    }
    setMode(nextMode);
  };

  const navigateToOutlineHeading = (event: MouseEvent<HTMLAnchorElement>, headingId: string) => {
    event.preventDefault();
    if (outlineScrollTimerRef.current !== null) window.clearTimeout(outlineScrollTimerRef.current);
    outlineScrollLockRef.current = headingId;
    setActiveHeading(headingId);

    const target = mode === 'preview'
      ? previewRef.current?.querySelector<HTMLElement>(`#${CSS.escape(headingId)}`)
      : editorMirrorRef.current?.querySelector<HTMLElement>(`[data-heading-id="${CSS.escape(headingId)}"]`);
    if (!target) {
      outlineScrollLockRef.current = '';
      return;
    }

    const scrollRoot = window.document.scrollingElement ?? window.document.documentElement;
    const targetRect = target.getBoundingClientRect();
    const targetTop = scrollRoot.scrollTop + targetRect.top - (window.innerHeight - targetRect.height) / 2;
    if (Math.abs(targetTop - scrollRoot.scrollTop) <= 1) {
      outlineScrollLockRef.current = '';
      return;
    }
    scrollRoot.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  };

  if (!document) return null;

  return (
    <main className="doc-editor-page">
      <header className="doc-editor-header" style={{ backgroundImage: `url("${remoteCover || document.cover}")` }}>
        <div className="doc-editor-header-shade">
          <div className="doc-editor-header-top">
            <button type="button" className="doc-back-button" onClick={() => navigate(docsReturnUrl)}><ArrowLeft size={17} /> {t('docs.back')}</button>
            {currentUser && id && !documents.some((item) => item.id === id) && <button type="button" className="doc-info-button" onClick={openInfo} disabled={isLibraryDocument} aria-disabled={isLibraryDocument} aria-label={t('docs.documentInformation')}><Info size={17} /></button>}
            <div className="doc-editor-save-status">
              {savedAt && !isSaving ? <><Check size={15} /> {isRemoteDocument ? t('docs.saved') : t('docs.savedLocally')}</> : <><Save size={15} /> {t('docs.saving')}</>}
            </div>
          </div>
        </div>
      </header>
      <aside className="doc-outline">
        <div className="doc-outline-heading">
          <div className="doc-outline-heading-title"><FileText size={15} /><span>{t('docs.index')}</span></div>
        </div>
        <div className="doc-outline-rule" aria-hidden="true"><span style={{ width: `${outline.length ? ((outline.findIndex((item) => item.id === activeHeading) + 1) / outline.length) * 100 : 0}%` }} /></div>
        <nav aria-label={t('docs.documentOutline')}>
          {outline.map((item) => <a className={`level-${item.level}${activeHeading === item.id ? ' is-active' : ''}`} href={`#${item.id}`} key={item.id} aria-current={activeHeading === item.id ? 'location' : undefined} onClick={(event) => navigateToOutlineHeading(event, item.id)}><span className="doc-outline-marker" aria-hidden="true" /><span className="doc-outline-level">H{item.level}</span><span className="doc-outline-label">{item.label}</span></a>)}
        </nav>
      </aside>
      {mode === 'edit' && (
        <div className="doc-markdown-toolbar" aria-label={t('docs.markdownFormatting')}>
          <button type="button" onClick={() => insertMarkdown('**', '**', 'bold')} aria-label={t('docs.bold')}><Bold size={16} /></button>
          <button type="button" onClick={() => insertMarkdown('*', '*', 'italic')} aria-label={t('docs.italic')}><Italic size={16} /></button>
          <button type="button" onClick={() => insertMarkdown('## ', '', 'Heading')} aria-label={t('docs.heading')}><Heading2 size={16} /></button>
          <button type="button" onClick={() => insertMarkdown('- ', '', 'List item')} aria-label={t('docs.bulletList')}><List size={16} /></button>
          <button type="button" onClick={() => insertMarkdown('> ', '', 'Quote')} aria-label={t('docs.quote')}><Quote size={16} /></button>
          <button type="button" onClick={() => insertMarkdown('`', '`', 'code')} aria-label={t('docs.inlineCode')}><Code2 size={16} /></button>
          <button type="button" onClick={insertCodeBlock} aria-label={t('docs.codeBlock')}><Braces size={16} /></button>
          <button type="button" onClick={insertCodeTabs} aria-label={t('docs.codeGroup')}><FolderCode size={16} /></button>
          <button type="button" onClick={insertTable} aria-label={t('docs.insertTable')}><Table2 size={16} /></button>
          <button type="button" onClick={insertUnicodeTable} aria-label={t('docs.insertUnicodeTable')}><Rows3 size={16} /></button>
          <button type="button" onClick={() => insertMarkdown('[', '](https://)', 'link text')} aria-label={t('docs.link')}><Link2 size={16} /></button>
          <button type="button" onClick={() => imageInputRef.current?.click()} aria-label="Upload image" title="Upload image"><ImagePlus size={16} /></button>
        </div>
      )}
      <div className={`doc-editor-workspace is-${mode}`}>
        <div className={`doc-editor-edit-pane${mode === 'edit' ? ' is-visible' : ''}`} aria-hidden={mode !== 'edit'}>
            <input ref={imageInputRef} className="doc-image-input" type="file" accept="image/*" multiple onChange={(event) => { if (event.target.files) void uploadAndInsertImages(event.target.files); event.currentTarget.value = ''; }} />
            {imageUploadError && <p className="doc-image-upload-error" role="alert">{imageUploadError}</p>}
            {documentImages.length > 0 && <div className="doc-image-name-list" aria-label="Document images">{Array.from(new Set(documentImages)).map((path) => {
              const filename = path.slice(path.lastIndexOf('/') + 1);
              return <label key={path}><Image size={14} /><input aria-label="Image filename" value={imageNameDrafts[path] ?? filename} onChange={(event) => setImageNameDrafts((drafts) => ({ ...drafts, [path]: event.target.value }))} onBlur={(event) => renameDocumentImage(path, event.currentTarget.value)} /></label>;
            })}</div>}
            <div className="doc-markdown-editor-wrap">
              <div ref={editorMirrorRef} className="doc-markdown-editor-mirror" aria-hidden="true">
                {editorMirrorLines}
              </div>
              <textarea
                ref={editorRef}
                className={`doc-markdown-editor${isImageDropActive ? ' is-image-drop-active' : ''}`}
                value={markdown}
                onChange={(event) => { setMarkdown(event.target.value); setSavedAt(false); }}
                onKeyDown={handleEditorKeyDown}
                onPaste={handleEditorPaste}
                onDragEnter={(event) => { if (Array.from(event.dataTransfer.types).includes('Files')) { event.preventDefault(); setIsImageDropActive(true); } }}
                onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
                onDragLeave={() => setIsImageDropActive(false)}
                onDrop={handleEditorDrop}
                spellCheck={false}
                aria-label={`${t('docs.markdownEditor')} ${displayTitle}`}
              />
            </div>
        </div>
        <article ref={previewRef} className={`doc-markdown-preview${mode === 'preview' ? ' is-visible' : ''}`} aria-hidden={mode !== 'preview'}>{previewContent}</article>
      </div>
      {imagePreviewUrl && <button type="button" className="doc-image-lightbox" onClick={() => setImagePreviewUrl('')} aria-label="Close image preview"><img src={imagePreviewUrl} alt="" /><X size={22} /></button>}
      <nav className="doc-editor-header-mode" aria-label={t('docs.editorMode')}>
        <div className="doc-editor-modes" role="tablist">
          <span className={`doc-editor-modes-thumb is-${mode}`} aria-hidden="true" />
          <button type="button" role="tab" aria-selected={mode === 'preview'} className={mode === 'preview' ? 'is-active' : ''} onClick={() => switchMode('preview')}><Eye size={16} /> {t('docs.preview')}</button>
          <button type="button" role="tab" aria-selected={mode === 'edit'} className={mode === 'edit' ? 'is-active' : ''} onClick={() => switchMode('edit')} disabled={isLibraryDocument} aria-disabled={isLibraryDocument}><Pencil size={16} /> {t('docs.edit')}</button>
        </div>
      </nav>
      {infoOpen && (
        <main className="doc-create-overlay">
          <button type="button" className="doc-create-backdrop" onClick={() => setInfoOpen(false)} aria-label={t('docs.closeDocumentInformation')} />
          <div className="doc-info-dialog" role="dialog" aria-modal="true" aria-labelledby="doc-info-title">
            <button type="button" className="doc-create-close" onClick={() => setInfoOpen(false)} aria-label={t('docs.close')}><X size={17} /></button>
            <aside className="doc-info-sidebar">
              <p>{t('docs.documentInformationLabel')}</p>
              <h2>{displayTitle}</h2>
              <nav>
                <button type="button" className={infoTab === 'detail' ? 'is-active' : ''} onClick={() => setInfoTab('detail')}><Info size={16} /> {t('docs.detail')}</button>
                <button type="button" className={`is-danger${infoTab === 'delete' ? ' is-active' : ''}`} onClick={() => setInfoTab('delete')}><X size={16} /> {t('docs.delete')}</button>
              </nav>
            </aside>
            <section className="doc-info-content">
              {infoTab === 'detail' ? (
                <form onSubmit={saveInfo}>
                  <div className="doc-create-heading"><span className="doc-create-icon"><Info size={22} /></span><div><h2 id="doc-info-title">{t('docs.documentDetails')}</h2><p>{t('docs.updateCardDetails')}</p></div></div>
                  <div className="doc-create-form">
                    <div className="doc-new-cover-wrap">
                      <label className={`doc-new-cover${infoCoverPreview ? ' has-preview' : ''}`} style={infoCoverPreview ? { backgroundImage: `url("${infoCoverPreview}")` } : undefined} aria-label={t('docs.changeCover')}>
                        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; setInfoCover(file); setInfoCoverPreview(file ? URL.createObjectURL(file) : infoCoverPreview); }} />
                        {!infoCoverPreview && <span>{t('docs.chooseCover')}</span>}
                      </label>
                      <small>{t('docs.coverCropHint')}</small>
                    </div>
                    <div className="doc-create-fields">
                      <label className="doc-new-inline-field"><span className="doc-new-field-label">{t('docs.title')}</span><input value={infoTitle} onChange={(event) => setInfoTitle(event.target.value)} autoFocus /></label>
                      <label className="doc-new-inline-field"><span className="doc-new-field-label">{t('docs.category')}</span><input value={infoCategory} onChange={(event) => setInfoCategory(event.target.value)} /></label>
                      <div className={`doc-visibility-field${infoPublic ? ' is-public' : ''}`}>
                        <div className="doc-visibility-copy">
                          <span className="doc-new-field-label">{t('docs.visibility')}</span>
                          <strong>{infoPublic ? t('docs.public') : t('docs.private')}</strong>
                          <small>{infoPublic ? t('docs.publicDescription') : t('docs.privateDescription')}</small>
                        </div>
                        <button type="button" className="doc-visibility-toggle" role="switch" aria-checked={infoPublic} aria-label={t('docs.visibility')} onClick={() => setInfoPublic((value) => !value)}>
                          <span className="doc-visibility-toggle-track"><span className="doc-visibility-toggle-thumb" /></span>
                          <span className="doc-visibility-toggle-state">{infoPublic ? t('docs.on') : t('docs.off')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="doc-create-actions"><button type="submit" className="doc-create-next" disabled={!infoTitle.trim() || !infoCategory.trim() || infoSaving}>{infoSaving ? t('docs.saving') : t('docs.save')} <Check size={16} /></button></div>
                </form>
              ) : (
                <div className="doc-info-delete">
                  <span className="doc-info-delete-icon"><X size={24} /></span>
                  <p className="doc-info-danger-label">{t('docs.permanentAction')}</p>
                  <h2>{t('docs.deleteDocumentTitle')}</h2>
                  <p>{t('docs.deleteDocumentDescription')}</p>
                  {infoError && <p className="doc-new-error" role="alert">{infoError}</p>}
                  <button type="button" className="doc-info-delete-confirm" onClick={removeDocument} disabled={infoDeleting}>{infoDeleting ? t('docs.deleting') : t('docs.deleteDocument')}</button>
                </div>
              )}
            </section>
          </div>
        </main>
      )}
    </main>
  );
}
