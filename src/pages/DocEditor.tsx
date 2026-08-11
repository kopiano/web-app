import { useEffect, useMemo, useRef, useState } from 'react';
import hljs from 'highlight.js/lib/common';
import { ArrowLeft, Bold, Braces, Check, Code2, Copy, Eye, FileText, FolderCode, Heading2, Italic, Link2, List, Pencil, Quote, Save } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { documents } from './Docs';
import '@/styles/doc-editor.scss';

type EditorMode = 'preview' | 'edit';

const seedMarkdown = (title: string, excerpt: string) => `# ${title}

${excerpt}

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
  jsx: 'xml',
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
    return <span dangerouslySetInnerHTML={{ __html: highlighted || '&nbsp;' }} />;
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
        <button type="button" className={`doc-code-copy${copied ? ' is-copied' : ''}`} onClick={copyCode} aria-label="Copy code">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy'}
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
  const tabs = Array.from(content.matchAll(/:::\s*([^\n]+)\n```([^\n]*)\n([\s\S]*?)\n```\s*:::/g))
    .map((match) => ({
      label: match[1].trim(),
      language: match[2].trim(),
      content: match[3],
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
          <div className="doc-code-tab-list" role="tablist" aria-label="Code files">
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

function renderMarkdown(markdown: string) {
  const blocks = markdown
    .split(/(::::[\s\S]*?::::|```[^\n]*\n[\s\S]*?```)/g)
    .flatMap((segment) => segment.startsWith('```') ? [segment] : segment.split(/\n{2,}/))
    .filter((block) => block.trim());
  const headingOccurrences = new Map<string, number>();

  return blocks.map((block, index) => {
    const lines = block.split('\n');
    const first = lines[0];
    if (block.startsWith('::::') && block.endsWith('::::')) {
      return <CodeTabs key={index} content={block.slice(4, -4).trim()} />;
    }
    const headingLevel = first.match(/^(#{1,3}) /)?.[1].length;
    const headingLabel = headingLevel ? first.slice(headingLevel + 1) : '';
    const headingOccurrence = headingLabel ? headingOccurrences.get(headingLabel) ?? 0 : 0;
    if (headingLabel) headingOccurrences.set(headingLabel, headingOccurrence + 1);
    if (headingLevel === 1) return <h1 id={createHeadingId(headingLabel, headingOccurrence)} key={index}>{headingLabel}</h1>;
    if (headingLevel === 2) return <h2 id={createHeadingId(headingLabel, headingOccurrence)} key={index}>{headingLabel}</h2>;
    if (headingLevel === 3) return <h3 id={createHeadingId(headingLabel, headingOccurrence)} key={index}>{headingLabel}</h3>;
    if (lines.every((line) => line.startsWith('- '))) {
      return <ul key={index}>{lines.map((line) => <li key={line}>{renderInlineMarkdown(line.slice(2))}</li>)}</ul>;
    }
    if (first.startsWith('> ')) return <blockquote key={index}>{renderInlineMarkdown(first.slice(2))}</blockquote>;
    if (first.startsWith('```')) {
      return <CodeBlock key={index} language={first.slice(3).trim()} content={lines.slice(1, -1).join('\n')} />;
    }
    return <p key={index}>{lines.map((line, lineIndex) => <span key={`${index}-${lineIndex}`}>{lineIndex > 0 && <br />}{renderInlineMarkdown(line)}</span>)}</p>;
  });
}

export default function DocEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const document = documents.find((item) => item.id === id) ?? documents[0];
  const storageKey = `lume-doc-markdown-${document.id}`;
  const [mode, setMode] = useState<EditorMode>('preview');
  const [activeHeading, setActiveHeading] = useState('');
  const [markdown, setMarkdown] = useState(() => localStorage.getItem(storageKey) || seedMarkdown(document.title, document.excerpt));
  const [savedAt, setSavedAt] = useState(() => Boolean(localStorage.getItem(storageKey)));
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(storageKey, markdown);
      setSavedAt(true);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [markdown, storageKey]);

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
        localStorage.setItem(storageKey, markdown);
        setSavedAt(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [markdown, storageKey]);

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
    const editor = event.currentTarget;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const lineStart = markdown.lastIndexOf('\n', start - 1) + 1;
    const selectedEnd = end > start && markdown[end - 1] === '\n' ? end - 1 : end;
    const lineEnd = markdown.indexOf('\n', selectedEnd);
    const rangeEnd = lineEnd === -1 ? markdown.length : lineEnd;
    const selectedLines = markdown.slice(lineStart, rangeEnd);
    const lines = selectedLines.split('\n');
    const nextLines = event.shiftKey
      ? lines.map((line) => line.startsWith('  ') ? line.slice(2) : line.startsWith(' ') ? line.slice(1) : line)
      : lines.map((line) => `  ${line}`);
    const replacement = nextLines.join('\n');
    const next = `${markdown.slice(0, lineStart)}${replacement}${markdown.slice(rangeEnd)}`;
    const offset = event.shiftKey
      ? lines.reduce((total, line) => total + (line.startsWith('  ') ? 2 : line.startsWith(' ') ? 1 : 0), 0)
      : lines.length * 2;
    setMarkdown(next);
    setSavedAt(false);
    requestAnimationFrame(() => {
      editor.focus();
      const nextStart = event.shiftKey ? Math.max(lineStart, start - Math.min(offset, start - lineStart)) : start + 2;
      const nextEnd = end > start
        ? (event.shiftKey ? Math.max(nextStart, end - offset) : end + offset)
        : nextStart;
      editor.setSelectionRange(nextStart, nextEnd);
    });
  };

  const outline = useMemo(() => {
    const headingOccurrences = new Map<string, number>();
    return markdown.split('\n').filter((line) => /^#{1,3} /.test(line)).map((line) => {
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
      <header className="doc-editor-header" style={{ backgroundImage: `url("${document.image}")` }}>
        <div className="doc-editor-header-shade">
          <div className="doc-editor-header-top">
            <button type="button" className="doc-back-button" onClick={() => navigate('/docs')}><ArrowLeft size={17} /> Back</button>
            <div className="doc-editor-save-status">{savedAt ? <><Check size={15} /> Saved locally</> : <><Save size={15} /> Saving...</>}</div>
          </div>
          <div className="doc-editor-header-mode">
            <div className="doc-editor-modes" role="tablist" aria-label="Editor mode">
              <span className={`doc-editor-modes-thumb is-${mode}`} aria-hidden="true" />
              <button type="button" className={mode === 'preview' ? 'is-active' : ''} onClick={() => setMode('preview')}><Eye size={16} /> Preview</button>
              <button type="button" className={mode === 'edit' ? 'is-active' : ''} onClick={() => setMode('edit')}><Pencil size={16} /> Edit</button>
            </div>
          </div>
        </div>
      </header>
      <aside className="doc-outline">
        <div className="doc-outline-heading">
          <div className="doc-outline-heading-title"><FileText size={15} /><span>INDEX</span></div>
        </div>
        <div className="doc-outline-rule" aria-hidden="true"><span style={{ width: `${outline.length ? ((outline.findIndex((item) => item.id === activeHeading) + 1) / outline.length) * 100 : 0}%` }} /></div>
        <nav aria-label="Document outline">
          {outline.map((item) => <a className={`level-${item.level}${activeHeading === item.id ? ' is-active' : ''}`} href={`#${item.id}`} key={item.id} aria-current={activeHeading === item.id ? 'location' : undefined} onClick={(event) => { setActiveHeading(item.id); event.currentTarget.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }}><span className="doc-outline-marker" aria-hidden="true" /><span className="doc-outline-level">H{item.level}</span><span className="doc-outline-label">{item.label}</span></a>)}
        </nav>
      </aside>
      <div className={`doc-editor-workspace is-${mode}`}>
        {mode === 'edit' && (
          <div className="doc-editor-edit-pane">
            <div className="doc-markdown-toolbar" aria-label="Markdown formatting">
              <button type="button" onClick={() => insertMarkdown('**', '**', 'bold')} aria-label="Bold"><Bold size={16} /></button>
              <button type="button" onClick={() => insertMarkdown('*', '*', 'italic')} aria-label="Italic"><Italic size={16} /></button>
              <button type="button" onClick={() => insertMarkdown('## ', '', 'Heading')} aria-label="Heading"><Heading2 size={16} /></button>
              <button type="button" onClick={() => insertMarkdown('- ', '', 'List item')} aria-label="Bullet list"><List size={16} /></button>
              <button type="button" onClick={() => insertMarkdown('> ', '', 'Quote')} aria-label="Quote"><Quote size={16} /></button>
              <button type="button" onClick={() => insertMarkdown('`', '`', 'code')} aria-label="Inline code"><Code2 size={16} /></button>
              <button type="button" onClick={insertCodeBlock} aria-label="Code block"><Braces size={16} /></button>
              <button type="button" onClick={insertCodeTabs} aria-label="Code group"><FolderCode size={16} /></button>
              <button type="button" onClick={() => insertMarkdown('[', '](https://)', 'link text')} aria-label="Link"><Link2 size={16} /></button>
            </div>
            <textarea ref={editorRef} className="doc-markdown-editor" value={markdown} onChange={(event) => { setMarkdown(event.target.value); setSavedAt(false); }} onKeyDown={handleEditorKeyDown} spellCheck={false} aria-label="Markdown editor" />
          </div>
        )}
        {mode === 'preview' && (
          <article ref={previewRef} className="doc-markdown-preview">{renderMarkdown(markdown)}</article>
        )}
      </div>
    </main>
  );
}
