export const VIDEO_RETURN_TO_KEY = 'lume-video-return-to-v1';

export function getVideoReturnTo() {
  try {
    const value = window.sessionStorage.getItem(VIDEO_RETURN_TO_KEY);
    if (value?.startsWith('/video') && !value.startsWith('//') && !value.includes('\\')) {
      return value;
    }
  } catch {
    // Navigation still falls back to the video home page when storage is unavailable.
  }
  return '/video';
}

export function rememberVideoReturnTo(value: string) {
  if (!value.startsWith('/video') || value.startsWith('//') || value.includes('\\')) return;
  try {
    window.sessionStorage.setItem(VIDEO_RETURN_TO_KEY, value);
  } catch {
    // Remembering the last video view is optional when storage is unavailable.
  }
}
