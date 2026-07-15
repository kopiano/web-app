export function resolveAvatarUrl(avatar?: string | null): string {
  if (!avatar) return '';
  if (/^(?:data:|blob:|https?:)/i.test(avatar)) return avatar;

  const apiUrl = import.meta.env.VITE_API_URL;
  if (!apiUrl) return avatar;

  try {
    return new URL(avatar, new URL(apiUrl).origin).toString();
  } catch {
    return avatar;
  }
}

export function resolveAssetUrl(asset?: string | null): string {
  if (!asset) return '';
  if (/^(?:data:|blob:|https?:)/i.test(asset)) return asset;

  const apiUrl = import.meta.env.VITE_API_URL;
  if (!apiUrl) return asset;

  try {
    return new URL(asset, new URL(apiUrl).origin).toString();
  } catch {
    return asset;
  }
}
