import systemNotificationAvatar from '@/assets/images/z-logo.png';

const SYSTEM_NOTIFICATION_NAMES = new Set([
  'system notifications',
  '系统通知',
]);

export function isSystemNotificationUser(name?: string | null): boolean {
  return SYSTEM_NOTIFICATION_NAMES.has(name?.trim().toLocaleLowerCase() || '');
}

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

export function defaultAvatarDataUrl(name?: string | null): string {
  const initial = Array.from(name?.trim() || 'G')[0]?.toUpperCase() || 'G';
  const escapedInitial = initial
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">',
    '<rect width="100" height="100" rx="50" fill="#202020" fill-opacity=".76"/>',
    `<text x="50" y="52" fill="#fff" font-family="Arial, sans-serif" font-size="44" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapedInitial}</text>`,
    '</svg>',
  ].join('');

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function resolveChatAvatarUrl(
  avatar?: string | null,
  username?: string | null,
): string {
  if (isSystemNotificationUser(username)) return systemNotificationAvatar;
  return resolveAvatarUrl(avatar) || defaultAvatarDataUrl(username);
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
