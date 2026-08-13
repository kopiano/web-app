import request from '@/api/request';
import { resolveAssetUrl } from '@/lib/avatar';

export interface RemoteDocument {
  id: string;
  title: string;
  category: string;
  date: string;
  image?: string | null;
  accent: string;
  content: string;
  public: boolean;
}

export interface RemoteDocumentContent {
  id: string;
  title: string;
  category: string;
  image?: string | null;
  content: string;
  public: boolean;
}

export function resolveDocumentAsset(value?: string | null, cacheBust?: string | number) {
  if (!value) return undefined;
  const resolved = resolveAssetUrl(value);

  if (cacheBust === undefined) return resolved;
  const separator = resolved.includes('?') ? '&' : '?';
  return `${resolved}${separator}v=${encodeURIComponent(String(cacheBust))}`;
}

export async function listDocuments() {
  const { data } = await request.get<RemoteDocument[]>('/docs');
  return data;
}

export async function listPublicDocuments() {
  const { data } = await request.get<RemoteDocument[]>('/docs?public=true');
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
  public: boolean;
}) {
  const form = new FormData();
  form.append('title', input.title);
  form.append('category', input.category);
  form.append('public', String(input.public));
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
