import request from '@/api/request';

export interface RemoteDocument {
  id: string;
  title: string;
  category: string;
  date: string;
  image?: string | null;
  accent: string;
  content: string;
}

export interface RemoteDocumentContent {
  id: string;
  title: string;
  category: string;
  image?: string | null;
  content: string;
}

export function resolveDocumentAsset(value?: string | null, cacheBust?: string | number) {
  if (!value) return undefined;
  let resolved: string;
  if (/^https?:\/\//.test(value)) {
    resolved = value;
  } else if (value.startsWith('/') && !value.startsWith('/api/')) {
    resolved = value;
  } else {
    const apiUrl = String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
    if (!apiUrl) resolved = value;
    else {
      const origin = new URL(apiUrl).origin;
      if (value.startsWith('/api/')) resolved = `${origin}${value}`;
      else resolved = `${apiUrl}${value.startsWith('/') ? value : `/${value}`}`;
    }
  }

  if (cacheBust === undefined) return resolved;
  const separator = resolved.includes('?') ? '&' : '?';
  return `${resolved}${separator}v=${encodeURIComponent(String(cacheBust))}`;
}

export async function listDocuments() {
  const { data } = await request.get<RemoteDocument[]>('/docs');
  return data;
}

export async function getDocument(id: string) {
  const { data } = await request.get<RemoteDocumentContent>(`/docs/${id}`);
  return data;
}

export async function updateDocument(id: string, content: string) {
  const { data } = await request.put<RemoteDocumentContent>(`/docs/${id}`, { content });
  return data;
}

export async function updateDocumentInfo(id: string, input: {
  title: string;
  category: string;
  image?: File | null;
}) {
  const form = new FormData();
  form.append('title', input.title);
  form.append('category', input.category);
  if (input.image) form.append('image', input.image);
  const { data } = await request.patch<RemoteDocumentContent>(`/docs/${id}`, form);
  return data;
}

export async function deleteDocument(id: string) {
  await request.delete(`/docs/${id}`);
}

export async function createDocument(input: {
  title: string;
  category: string;
  image?: File | null;
  content?: string;
}) {
  const form = new FormData();
  form.append('title', input.title);
  form.append('category', input.category);
  if (input.content !== undefined) form.append('content', input.content);
  if (input.image) form.append('image', input.image);
  const { data } = await request.post<RemoteDocument>('/docs', form);
  return data;
}
