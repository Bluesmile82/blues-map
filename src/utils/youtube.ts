/** Extract the video id from a YouTube watch or youtu.be URL. */
export function extractVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/[?&]v=([^&#]+)/) || url.match(/youtu\.be\/([^?&#]+)/);
  return match ? match[1] : null;
}

/** YouTube's anonymous playlist endpoint refuses more than 50 ids. */
export const YT_PLAYLIST_MAX = 50;

/**
 * Build a shareable YouTube playlist URL from video ids.
 * Uses the anonymous `watch_videos` endpoint so no YouTube account/API key is needed.
 */
export function buildYoutubePlaylistUrl(videoIds: (string | null)[]): string | null {
  const ids = videoIds.filter((id): id is string => !!id).slice(0, YT_PLAYLIST_MAX);
  if (ids.length === 0) return null;
  return `https://www.youtube.com/watch_videos?video_ids=${ids.join(',')}`;
}
