type DesktopReply = {ok: boolean; data: unknown};

declare global {
  interface Window {
    nanoMonitor?: {
      request: (action: string, method: string, body?: object) => Promise<DesktopReply>;
      previewUrl: string;
      thumbnailUrl?: string;
    };
  }
}

export function thumbnailUrl(id: string, session: number, retry = 0) {
  const base = typeof window !== 'undefined' && window.nanoMonitor
    ? window.nanoMonitor.thumbnailUrl || 'http://127.0.0.1:8765/thumbnail'
    : '/api/camera/thumbnail';
  return `${base}?id=${encodeURIComponent(id)}&session=${session}&retry=${retry}`;
}

export async function cameraRequest(action: string, method = 'GET', body?: object, signal?: AbortSignal) {
  if (typeof window !== 'undefined' && window.nanoMonitor) {
    const reply = await window.nanoMonitor.request(action, method, body);
    return {ok: reply.ok, json: async () => reply.data};
  }
  return fetch(`/api/camera/${action}`, {method, cache: 'no-store', signal,
    headers: body ? {'Content-Type': 'application/json'} : undefined,
    body: body ? JSON.stringify(body) : undefined});
}

export function previewUrl(generation: number) {
  return typeof window !== 'undefined' && window.nanoMonitor
    ? `${window.nanoMonitor.previewUrl}?session=${generation}`
    : `/api/camera/preview?session=${generation}`;
}
