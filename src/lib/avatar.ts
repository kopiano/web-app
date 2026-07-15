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
