import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import hljs from 'highlight.js/lib/common';
import { ArrowLeft, Bold, Braces, Check, Code2, Copy, Eye, FileText, FolderCode, Heading2, Info, Italic, Link2, List, Pencil, Quote, Rows3, Save, Table2, X } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import type { RootState } from '@/store/store';
import { deleteDocument, getDocument, resolveDocumentAsset, updateDocument, updateDocumentInfo } from '@/api/docs';
import { documents } from './Docs';
import customCodeKeywords from '@/config/codeKeywords.json';
import '@/styles/doc-editor.scss';

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

function renderInlineMarkdown(text: string) {
  return text.split(/(!\[[^\]]*\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g).map((part, index) => {
    const image = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (image) {
      return (
        <figure className="doc-markdown-image" key={`${index}-${part}`}>
          <img src={image[2]} alt={image[1]} loading="lazy" />
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

function CodeBlock({ content, language, headerContent }: { content: string; language: string; headerContent?: React.ReactNode }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const lines = content.split('\n');

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
    <div className="doc-code-block">
      <div className="doc-code-header">
        {headerContent ?? <span className="doc-code-language">{(language || 'text').toLowerCase()}</span>}
        <button type="button" className={`doc-code-copy${copied ? ' is-copied' : ''}`} onClick={copyCode} aria-label={t('docs.copyCode')}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? t('docs.copied') : t('docs.copy')}
        </button>
      </div>
      <pre>
        <code>
          {lines.map((line, index) => (
            <span className="doc-code-line" key={`${index}-${line}`}>
              <span className="doc-code-line-number">{index + 1}</span>
              <span className="doc-code-line-content">{highlightCode(line, language)}</span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

function CodeTabs({ content }: { content: string }) {
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
    <div className="doc-code-tabs">
      <CodeBlock
        content={active.content}
        language={active.language}
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

function MarkdownTable({ lines }: { lines: string[] }) {
  const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
  const headers = cells(lines[0]);
  const rows = lines.slice(2).map(cells);

  return (
    <div className="doc-markdown-table-wrap">
      <table className="doc-markdown-table">
        <thead><tr>{headers.map((cell, index) => <th key={`${cell}-${index}`}>{renderInlineMarkdown(cell)}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {headers.map((_, index) => <td key={`${rowIndex}-${index}`}>{renderInlineMarkdown(row[index] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoxTable({ lines }: { lines: string[] }) {
  const rows = lines
    .filter((line) => line.startsWith('│'))
    .map((line) => line.slice(1, -1).split('│').map((cell) => cell.trim()));
  const headers = rows[0] ?? [];

  return (
    <div className="doc-markdown-table-wrap">
      <table className="doc-markdown-table">
        <thead><tr>{headers.map((cell, index) => <th key={`${cell}-${index}`}>{renderInlineMarkdown(cell)}</th>)}</tr></thead>
        <tbody>
          {rows.slice(1).map((row, rowIndex) => (
            <tr key={rowIndex}>
              {headers.map((_, index) => <td key={`${rowIndex}-${index}`}>{renderInlineMarkdown(row[index] ?? '')}</td>)}
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
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('```')) {
      inFence = !inFence;
      result.push(line);
      continue;
    }
    if (!inFence && line.startsWith('┌')) {
      if (result.length && result[result.length - 1] !== '') result.push('');
      result.push(line);
      while (index + 1 < lines.length) {
        index += 1;
        result.push(lines[index]);
        if (lines[index].startsWith('└')) break;
      }
      if (index + 1 < lines.length && lines[index + 1] !== '') result.push('');
      continue;
    }
    const separator = lines[index + 1];
    const isTableStart = !inFence
      && line.includes('|')
      && Boolean(separator && /^\s*\|?[\s:-]+(\|[\s:-]+)+\|?\s*$/.test(separator));

    if (isTableStart && result.length && result[result.length - 1] !== '') result.push('');
    result.push(line);

    if (isTableStart) {
      index += 1;
      result.push(lines[index]);
      while (index + 1 < lines.length && lines[index + 1].includes('|')) {
        index += 1;
        result.push(lines[index]);
      }
      if (index + 1 < lines.length && lines[index + 1] !== '') result.push('');
    }
  }

  return result.join('\n');
}

function renderMarkdown(markdown: string) {
  const markdownWithBlockBoundaries = separateMarkdownTables(markdown)
    .split('\n')
    .reduce<{ lines: string[]; inFence: boolean }>((state, line, index, lines) => {
      const previous = lines[index - 1] ?? '';
      const next = lines[index + 1] ?? '';
      const isFence = /^```/.test(line);
      const isInsideFence = state.inFence;
      const isHeading = !isInsideFence && /^#{1,3}\s+/.test(line);
      const isListItem = !isInsideFence && /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line);
      const previousIsListItem = /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(previous);
      const nextIsListItem = /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(next);
      if (line.trim() && previous.trim() && (isHeading || (isListItem && !previousIsListItem))) {
        state.lines.push('');
      }
      state.lines.push(line);
      // Treat standalone Markdown blocks as boundaries even when the author
      // did not add a blank line after them.
      if (line.trim() && next.trim() && (
        isHeading
        || (isListItem && !nextIsListItem)
      )) {
        state.lines.push('');
      }
      if (isFence) state.inFence = !state.inFence;
      return state;
    }, { lines: [], inFence: false })
    .lines
    .join('\n');
  const blocks = markdownWithBlockBoundaries
    .split(/(::::[\s\S]*?::::|```[^\r\n]*\r?\n[\s\S]*?```)/g)
    .flatMap((segment) => (
      segment.startsWith('```') || segment.startsWith('::::')
        ? [segment]
        : segment.split(/\n{2,}/)
    ))
    .filter((block) => block.trim());
  const headingOccurrences = new Map<string, number>();

  return blocks.map((block, index) => {
    const lines = block.split('\n');
    const first = lines[0];
    if (block.startsWith('::::') && block.endsWith('::::')) {
      return <CodeTabs key={index} content={block.slice(4, -4).trim()} />;
    }
    if (first.startsWith('```') && lines[lines.length - 1].trim() === '```') {
      return <CodeBlock key={index} language={first.slice(3).trim()} content={lines.slice(1, -1).join('\n')} />;
    }
    if (first.startsWith('┌') && lines.some((line) => line.startsWith('└'))) {
      return <BoxTable key={index} lines={lines} />;
    }
    if (lines.length >= 2 && lines[0].includes('|') && /^\s*\|?[\s:-]+(\|[\s:-]+)+\|?\s*$/.test(lines[1])) {
      return <MarkdownTable key={index} lines={lines} />;
    }
    const headingLevel = first.match(/^(#{1,3}) /)?.[1].length;
    const headingLabel = headingLevel ? first.slice(headingLevel + 1) : '';
    const headingOccurrence = headingLabel ? headingOccurrences.get(headingLabel) ?? 0 : 0;
    if (headingLabel) headingOccurrences.set(headingLabel, headingOccurrence + 1);
    if (headingLevel === 1) return <h1 id={createHeadingId(headingLabel, headingOccurrence)} key={index}>{headingLabel}</h1>;
    if (headingLevel === 2) return <h2 id={createHeadingId(headingLabel, headingOccurrence)} key={index}>{headingLabel}</h2>;
    if (headingLevel === 3) return <h3 id={createHeadingId(headingLabel, headingOccurrence)} key={index}>{headingLabel}</h3>;
    const unorderedItems = lines.map((line) => line.match(/^\s*[-*+]\s+(.+)$/)?.[1]);
    if (unorderedItems.every((item): item is string => Boolean(item))) {
      return <ul key={index}>{unorderedItems.map((item, itemIndex) => <li key={`${index}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>)}</ul>;
    }
    const orderedItems = lines.map((line) => line.match(/^\s*\d+[.)]\s+(.+)$/)?.[1]);
    if (orderedItems.every((item): item is string => Boolean(item))) {
      return <ol key={index}>{orderedItems.map((item, itemIndex) => <li key={`${index}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>)}</ol>;
    }
    if (first.startsWith('> ')) return <blockquote key={index}>{renderInlineMarkdown(first.slice(2))}</blockquote>;
    return <p key={index}>{lines.map((line, lineIndex) => <span key={`${index}-${lineIndex}`}>{lineIndex > 0 && <br />}{renderInlineMarkdown(line)}</span>)}</p>;
  });
}

export default function DocEditor() {
  const { t } = useTranslation();
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isLibraryDocument = new URLSearchParams(location.search).get('from') === 'library';
  const document = documents.find((item) => item.id === id) ?? documents[0];
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const documentId = id ?? document.id;
  const storageKey = `lume-doc-markdown-${documentId}`;
  const [remoteTitle, setRemoteTitle] = useState('');
  const [remoteCategory, setRemoteCategory] = useState('');
  const [remotePublic, setRemotePublic] = useState(false);
  const [remoteImage, setRemoteImage] = useState<string | undefined>();
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoTab, setInfoTab] = useState<'detail' | 'delete'>('detail');
  const [infoTitle, setInfoTitle] = useState('');
  const [infoCategory, setInfoCategory] = useState('');
  const [infoPublic, setInfoPublic] = useState(false);
  const [infoImage, setInfoImage] = useState<File | null>(null);
  const [infoPreview, setInfoPreview] = useState('');
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoDeleting, setInfoDeleting] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [mode, setMode] = useState<EditorMode>(() => (
    !isLibraryDocument && (location.state as { startInEdit?: boolean } | null)?.startInEdit ? 'edit' : 'preview'
  ));
  const [activeHeading, setActiveHeading] = useState('');
  const [markdown, setMarkdown] = useState(() => localStorage.getItem(storageKey) || seedMarkdown(document.title, document.content));
  const [savedAt, setSavedAt] = useState(() => Boolean(localStorage.getItem(storageKey)));
  const [isSaving, setIsSaving] = useState(false);
  const [remoteLoaded, setRemoteLoaded] = useState(() => !Boolean(currentUser && id && !documents.some((item) => item.id === id)));
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const displayTitle = remoteTitle || document.title;
  const isRemoteDocument = Boolean(currentUser && id && !documents.some((item) => item.id === id));
  const previewContent = useMemo(() => renderMarkdown(markdown), [markdown]);

  const saveDocument = useCallback(() => {
    const contentToSave = markdown;
    const save = async () => {
      localStorage.setItem(storageKey, contentToSave);
      if (!isRemoteDocument) {
        setSavedAt(true);
        return true;
      }
      setIsSaving(true);
      try {
        await updateDocument(id!, contentToSave);
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
      setRemoteImage(resolveDocumentAsset(remote.image, Date.now()));
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

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || mode !== 'edit') return;
    editor.style.height = 'auto';
    editor.style.height = `${editor.scrollHeight}px`;
  }, [markdown, mode]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview || mode !== 'preview') return;
    const headings = Array.from(preview.querySelectorAll<HTMLElement>('h1, h2, h3'));
    const updateActiveHeading = () => {
      const current = headings.reduce<HTMLElement | null>((last, heading) => (
        heading.offsetTop - preview.scrollTop <= 120 ? heading : last
      ), headings[0] ?? null);
      if (current) setActiveHeading(current.id);
    };
    updateActiveHeading();
    preview.addEventListener('scroll', updateActiveHeading, { passive: true });
    return () => preview.removeEventListener('scroll', updateActiveHeading);
  }, [markdown, mode]);

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

  const openInfo = () => {
    setInfoTitle(remoteTitle || document.title);
    setInfoCategory(remoteCategory || document.category);
    setInfoPublic(remotePublic);
    setInfoImage(null);
    setInfoPreview(remoteImage || document.image);
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
      const updated = await updateDocumentInfo(id, { title: infoTitle.trim(), category: infoCategory.trim(), image: infoImage, public: infoPublic });
      setRemoteTitle(updated.title);
      setRemoteCategory(updated.category);
      setInfoPublic(updated.public === true);
      setRemoteImage(resolveDocumentAsset(updated.image, Date.now()));
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

  const outline = useMemo(() => {
    const headingOccurrences = new Map<string, number>();
    let inFence = false;
    return markdown.split('\n').filter((line) => {
      if (/^```/.test(line.trim())) {
        inFence = !inFence;
        return false;
      }
      if (inFence || /^::::/.test(line.trim()) || /^:::/.test(line.trim())) return false;
      return /^#{1,3} /.test(line);
    }).map((line) => {
      const level = line.match(/^#+/)?.[0].length ?? 1;
      const label = line.slice(level + 1);
      const occurrence = headingOccurrences.get(label) ?? 0;
      headingOccurrences.set(label, occurrence + 1);
      return { label, id: createHeadingId(label, occurrence), level };
    });
  }, [markdown]);

  if (!document) return null;

  return (
    <main className="doc-editor-page">
      <header className="doc-editor-header" style={{ backgroundImage: `url("${remoteImage || document.image}")` }}>
        <div className="doc-editor-header-shade">
          <div className="doc-editor-header-top">
            <button type="button" className="doc-back-button" onClick={() => navigate(isLibraryDocument ? '/docs?view=library' : '/docs?view=list')}><ArrowLeft size={17} /> {t('docs.back')}</button>
            {currentUser && id && !documents.some((item) => item.id === id) && <button type="button" className="doc-info-button" onClick={openInfo} disabled={isLibraryDocument} aria-disabled={isLibraryDocument} aria-label={t('docs.documentInformation')}><Info size={17} /></button>}
            <div className="doc-editor-save-status">
              {savedAt && !isSaving ? <><Check size={15} /> {isRemoteDocument ? t('docs.saved') : t('docs.savedLocally')}</> : <><Save size={15} /> {t('docs.saving')}</>}
            </div>
          </div>
          <div className="doc-editor-header-mode">
            <div className="doc-editor-modes" role="tablist" aria-label={t('docs.editorMode')}>
              <span className={`doc-editor-modes-thumb is-${mode}`} aria-hidden="true" />
              <button type="button" className={mode === 'preview' ? 'is-active' : ''} onClick={() => setMode('preview')}><Eye size={16} /> {t('docs.preview')}</button>
              <button type="button" className={mode === 'edit' ? 'is-active' : ''} onClick={() => setMode('edit')} disabled={isLibraryDocument} aria-disabled={isLibraryDocument}><Pencil size={16} /> {t('docs.edit')}</button>
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
          {outline.map((item) => <a className={`level-${item.level}${activeHeading === item.id ? ' is-active' : ''}`} href={`#${item.id}`} key={item.id} aria-current={activeHeading === item.id ? 'location' : undefined} onClick={(event) => { setActiveHeading(item.id); event.currentTarget.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }}><span className="doc-outline-marker" aria-hidden="true" /><span className="doc-outline-level">H{item.level}</span><span className="doc-outline-label">{item.label}</span></a>)}
        </nav>
      </aside>
      <div className={`doc-editor-workspace is-${mode}`}>
        <div className={`doc-editor-edit-pane${mode === 'edit' ? ' is-visible' : ''}`} aria-hidden={mode !== 'edit'}>
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
            </div>
            <textarea ref={editorRef} className="doc-markdown-editor" value={markdown} onChange={(event) => { setMarkdown(event.target.value); setSavedAt(false); }} onKeyDown={handleEditorKeyDown} spellCheck={false} aria-label={`${t('docs.markdownEditor')} ${displayTitle}`} />
        </div>
        <article ref={previewRef} className={`doc-markdown-preview${mode === 'preview' ? ' is-visible' : ''}`} aria-hidden={mode !== 'preview'}>{previewContent}</article>
      </div>
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
                    <div className="doc-new-image-wrap">
                      <label className={`doc-new-image${infoPreview ? ' has-preview' : ''}`} style={infoPreview ? { backgroundImage: `url("${infoPreview}")` } : undefined} aria-label={t('docs.changeCover')}>
                        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; setInfoImage(file); setInfoPreview(file ? URL.createObjectURL(file) : infoPreview); }} />
                        {!infoPreview && <span>{t('docs.chooseCover')}</span>}
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
