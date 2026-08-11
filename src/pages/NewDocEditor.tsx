import { ChangeEvent, FormEvent, useState } from 'react';
import { ArrowRight, ImagePlus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createDocument } from '@/api/docs';
import '@/styles/doc-editor.scss';

export default function NewDocEditor({ onClose }: { onClose?: () => void }) {
  const navigate = useNavigate();
  const close = onClose ?? (() => navigate('/docs'));
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setImage(file);
    setPreview(file ? URL.createObjectURL(file) : '');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !category.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const document = await createDocument({ title: title.trim(), category: category.trim(), image });
      navigate(`/docs/${document.id}`, { state: { startInEdit: true } });
    } catch (cause) {
      const error = cause as {
        response?: { status?: number; data?: { message?: string } };
        message?: string;
      };
      const status = error.response?.status;
      const message = error.response?.data?.message;
      if (status === 401) {
        setError('Please sign in before creating a document.');
      } else if (status === 409) {
        setError('A document with this title already exists.');
      } else {
        setError(message || error.message || 'Unable to create this document.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="doc-create-overlay">
      <button type="button" className="doc-create-backdrop" onClick={close} aria-label="Close create document dialog" />
      <form className="doc-create-dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="doc-create-title">
        <button type="button" className="doc-create-close" onClick={close} aria-label="Close"><X size={17} /></button>
        <div className="doc-create-heading">
          <span className="doc-create-icon"><ImagePlus size={22} /></span>
          <div><h2 id="doc-create-title">Create document</h2><p>Set up the document card, then write in the editor.</p></div>
        </div>
        <div className="doc-create-form">
          <div className="doc-new-image-wrap">
            <label
              className={`doc-new-image${preview ? ' has-preview' : ''}`}
              style={preview ? { backgroundImage: `url("${preview}")` } : undefined}
              aria-label={preview ? 'Change cover image' : 'Choose cover image'}
              title={preview ? 'Click to change cover image' : 'Choose cover image'}
            >
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={selectImage} />
              {!preview && <ImagePlus size={24} />}
              {!preview && <span>Choose cover image</span>}
            </label>
            <small>Cover is cropped to 720 × 480 WebP.</small>
          </div>
          <div className="doc-create-fields">
            <label className="doc-new-inline-field">
              <span className="doc-new-field-label">Title</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Document title" autoFocus />
            </label>
            <label className="doc-new-inline-field">
              <span className="doc-new-field-label">Category</span>
              <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Personal" />
            </label>
          </div>
        </div>
        {error && <p className="doc-new-error" role="alert">{error}</p>}
        <div className="doc-create-actions">
          <button type="submit" className="doc-create-next" disabled={!title.trim() || !category.trim() || saving}>{saving ? 'Creating...' : 'Next'} <ArrowRight size={16} /></button>
        </div>
      </form>
    </main>
  );
}
