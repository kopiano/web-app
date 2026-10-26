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

export interface DocumentPage {
  items: RemoteDocument[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  categories: Array<{ name: string; count: number }>;
  serverPaginated: boolean;
}

export function resolveDocumentAsset(value?: string | null, cacheBust?: string | number) {
  if (!value) return undefined;
  const resolved = resolveAssetUrl(value);

  if (cacheBust === undefined) return resolved;
  const separator = resolved.includes('?') ? '&' : '?';
  return `${resolved}${separator}v=${encodeURIComponent(String(cacheBust))}`;
}

export async function createDocumentCoverThumbnail(image: File) {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(image);
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 480;
    const context = canvas.getContext('2d');
    if (!context) return image;

    const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const cropWidth = canvas.width / scale;
    const cropHeight = canvas.height / scale;
    const cropX = (bitmap.width - cropWidth) / 2;
    const cropY = (bitmap.height - cropHeight) / 2;
    context.drawImage(
      bitmap,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    const thumbnail = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', 0.82);
    });
    if (!thumbnail || thumbnail.type !== 'image/webp') return image;

    const baseName = image.name.replace(/\.[^.]+$/, '') || 'cover';
    return new File([thumbnail], `${baseName}.webp`, {
      type: 'image/webp',
      lastModified: image.lastModified,
    });
  } catch {
    return image;
  } finally {
    bitmap?.close();
  }
}

export async function listDocuments(options: {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
} = {}): Promise<DocumentPage> {
  const params = {
    page: Math.max(1, Number(options.page) || 1),
    page_size: Math.min(50, Math.max(1, Number(options.pageSize) || 12)),
    ...(options.search?.trim() ? { search: options.search.trim() } : {}),
    ...(options.category ? { category: options.category } : {}),
  };
  const { data } = await request.get<RemoteDocument[] | {
    items: RemoteDocument[];
    page?: number;
    page_size?: number;
    total?: number;
    total_pages?: number;
    categories?: Array<{ name: string; count: number }>;
  }>('/docs', { params });
  if (Array.isArray(data)) {
    const categoryCounts = new Map<string, number>();
    data.forEach((document) => {
      const category = document.category?.trim();
      if (category) categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    });
    return {
      items: data,
      page: 1,
      pageSize: params.page_size,
      total: data.length,
      totalPages: 1,
      categories: Array.from(categoryCounts, ([name, count]) => ({ name, count })),
      serverPaginated: false,
    };
  }
  if (!data || !Array.isArray(data.items)) throw new Error('Invalid document page response');
  return {
    items: data.items,
    page: Math.max(1, Number(data.page) || params.page),
    pageSize: Math.max(1, Number(data.page_size) || params.page_size),
    total: Math.max(0, Number(data.total) || 0),
    totalPages: Math.max(
      0,
      Number(data.total_pages) || Math.ceil((Number(data.total) || 0) / params.page_size),
    ),
    categories: Array.isArray(data.categories)
      ? data.categories
        .filter((item) => item && typeof item.name === 'string')
        .map((item) => ({ name: item.name.trim(), count: Math.max(0, Number(item.count) || 0) }))
        .filter((item) => item.name)
      : [],
    serverPaginated: true,
  };
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
  if (input.image) {
    form.append('image', await createDocumentCoverThumbnail(input.image));
  }
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
  if (input.image) {
    form.append('image', await createDocumentCoverThumbnail(input.image));
  }
  const { data } = await request.post<RemoteDocument>('/docs', form);
  return data;
}
