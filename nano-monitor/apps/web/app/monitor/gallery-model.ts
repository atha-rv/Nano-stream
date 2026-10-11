export type CameraVideo = {id: string; name: string; size: number; recordedAt: string | null; storage: string; alreadySaved: boolean; conflict: boolean};
export type GalleryFilter = 'today' | 'week' | 'five' | 'ten' | 'all' | 'range';
export const filterLabels: Record<GalleryFilter, string> = {today: 'Recorded today', week: 'Past 7 days', five: 'Last 5 videos', ten: 'Last 10 videos', all: 'All videos', range: 'Date range'};

export function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function filterVideos(videos: CameraVideo[], filter: GalleryFilter, today = new Date(), from = '', to = '') {
  const sorted = [...videos].sort((a,b) => {
    if (!a.recordedAt || !b.recordedAt) return a.recordedAt ? -1 : b.recordedAt ? 1 : b.name.localeCompare(a.name);
    return b.recordedAt.localeCompare(a.recordedAt) || b.name.localeCompare(a.name);
  });
  if (filter === 'five' || filter === 'ten') return sorted.slice(0, filter === 'five' ? 5 : 10);
  if (filter === 'all') return sorted;
  const end = localDate(today);
  const start = new Date(today); start.setDate(start.getDate()-6);
  const lower = filter === 'today' ? end : filter === 'week' ? localDate(start) : from;
  const upper = filter === 'range' ? to : end;
  if (!lower || !upper || lower > upper) return [];
  return sorted.filter(video => !!video.recordedAt && video.recordedAt.slice(0,10) >= lower && video.recordedAt.slice(0,10) <= upper);
}

export function selectedFromFilter(videos: CameraVideo[]) {
  return new Set(videos.filter(video => !video.conflict).map(video => video.id));
}
