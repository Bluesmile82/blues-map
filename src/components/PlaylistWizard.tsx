import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai';
import {
  X, Play, SkipForward, Youtube, Shuffle, Share2, Check, Bookmark,
  ChevronDown, ChevronUp, ListPlus, ListMusic, Pencil,
} from 'lucide-react';
import type { Musician } from '../types';
import { getStyleHex, CANONICAL_STYLES } from '../utils/colors';
import { buildRelatedIndex } from '../utils/relations';
import SearchInput from './SearchInput';
import { buildYoutubePlaylistUrl, extractVideoId } from '../utils/youtube';
import { buildPlaylist, buildShareUrl, DEFAULT_PLAYLIST_FILTERS, PLAYLIST_SIZES, type PlaylistFilters } from '../utils/playlist';
import { favoritesMapAtom } from '../atoms/lists';
import { userAtom } from '../atoms/auth';
import { useLists } from '../hooks/useLists';

interface Props {
  musicians: Musician[];
  /** Currently selected musician — pre-fills the "related to" anchor */
  selected: Musician | null;
  /** An existing queue to edit verbatim, instead of drawing a new one from the filters */
  initialQueue?: Musician[] | null;
  onPlay: (queue: Musician[]) => void;
  onClose: () => void;
}

export default function PlaylistWizard({ musicians, selected, initialQueue, onPlay, onClose }: Props) {
  const { t } = useTranslation();
  const user = useAtomValue(userAtom);
  const favoritesMap = useAtomValue(favoritesMapAtom);

  const [filters, setFilters] = useState<PlaylistFilters>({
    ...DEFAULT_PLAYLIST_FILTERS,
    // Only a convenience for a fresh draw — an existing queue wasn't produced by
    // this filter, so don't imply otherwise when editing one
    relatedToId: initialQueue ? null : selected?.id ?? null,
  });
  /** Ids the user removed from the generated list */
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  /** Search text for the "related to" musician picker */
  const [relatedSearch, setRelatedSearch] = useState('');
  /** Bumped to draw a fresh set of musicians from the same filters */
  const [reroll, setReroll] = useState(0);
  /** Non-null while showing an existing playlist as-is; cleared once a filter is touched */
  const [editedQueue, setEditedQueue] = useState<Musician[] | null>(initialQueue ?? null);
  const [shareDone, setShareDone] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const { createList, addToList } = useLists();

  const eligible = useMemo(
    () => musicians.filter((m) => m.name && m.bluesStyle && m.activeFrom && extractVideoId(m.youtubeLink)),
    [musicians],
  );

  const { minYear, maxYear } = useMemo(() => {
    const years = eligible.map((m) => parseInt(m.activeFrom)).filter((y) => !isNaN(y));
    if (!years.length) return { minYear: 1880, maxYear: 1990 };
    return { minYear: Math.min(...years), maxYear: Math.max(...years) };
  }, [eligible]);

  const yearRange = filters.yearRange ?? [minYear, maxYear];

  const availableStyles = useMemo(
    () => CANONICAL_STYLES.filter((s) => eligible.some((m) => m.bluesStyle === s)),
    [eligible],
  );

  const relatedIndex = useMemo(() => buildRelatedIndex(musicians), [musicians]);

  /** The chosen "related to" anchor — any musician, not just the selected one */
  const relatedTo = useMemo(
    () => musicians.find((m) => m.id === filters.relatedToId) ?? null,
    [musicians, filters.relatedToId],
  );

  /** Name for a saved list — describes the filters that produced the playlist */
  const playlistName = useMemo(() => {
    const parts: string[] = [];
    if (filters.style) parts.push(t(`styles.${filters.style}`, filters.style));
    if (relatedTo) parts.push(`${t('playlist.relatedTo')} ${relatedTo.name}`);
    if (filters.yearRange) parts.push(`${filters.yearRange[0]}–${filters.yearRange[1]}`);
    const base = parts.length > 0 ? parts.join(' · ') : t('playlist.title');
    return `${base} (${new Date().toLocaleDateString()})`;
  }, [filters.style, filters.yearRange, relatedTo, t]);

  const relatedMatches = useMemo(() => {
    const q = relatedSearch.trim().toLowerCase();
    if (!q) return [];
    return musicians.filter((m) => m.name?.toLowerCase().includes(q)).slice(0, 8);
  }, [musicians, relatedSearch]);

  const isFavorite = useMemo(() => {
    return (id: string) => {
      for (const set of favoritesMap.values()) if (set.has(id)) return true;
      return false;
    };
  }, [favoritesMap]);

  const generated = useMemo(() => {
    if (editedQueue) return editedQueue;
    const relatedIds = filters.relatedToId ? relatedIndex(filters.relatedToId) : null;
    return buildPlaylist(eligible, filters, { isFavorite, relatedIds });
    // `reroll` is a cache-buster: the draw is random, so this redraws it
  }, [editedQueue, eligible, filters, isFavorite, relatedIndex, reroll]);

  const queue = useMemo(() => generated.filter((m) => !removed.has(m.id)), [generated, removed]);

  // Deletions belong to a specific generated list — drop them when the filters change
  useEffect(() => { setRemoved(new Set()); setSavedMessage(null); }, [filters]);

  const youtubeUrl = buildYoutubePlaylistUrl(queue.map((m) => extractVideoId(m.youtubeLink)));
  const shareUrl = buildShareUrl(queue.map((m) => m.id), window.location.origin);

  const handleShare = async () => {
    if (!shareUrl) return;
    // Prefer the OS share sheet where there is one (mobile), else copy the link
    if (navigator.share) {
      try {
        await navigator.share({ title: t('playlist.title'), url: shareUrl });
        return;
      } catch {
        // Cancelled or unsupported — fall through to copying
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareDone(true);
      window.setTimeout(() => setShareDone(false), 2000);
    } catch {
      setSavedMessage(t('playlist.shareFailed'));
    }
  };

  /** Save the queue as a new list in the app, preserving its order via the list name only. */
  const handleSaveToList = async () => {
    if (!user || queue.length === 0) return;
    setSaving(true);
    setSaveOpen(false);
    const list = await createList(playlistName);
    if (!list) {
      setSaving(false);
      setSavedMessage(t('playlist.saveFailed'));
      return;
    }
    for (const m of queue) await addToList(list.id, m.id);
    setSaving(false);
    setSavedMessage(t('playlist.savedToList', { name: list.name }));
  };

  // Touching a filter means "draw me a new playlist", so it drops out of edit mode
  const patch = (p: Partial<PlaylistFilters>) => {
    setEditedQueue(null);
    setFilters((f) => ({ ...f, ...p }));
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-6" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg h-full sm:h-auto sm:max-h-[85vh] flex flex-col bg-bg border border-border-subtle sm:rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
          <div className="min-w-0">
            <h2 className="text-ink font-bold tracking-widest uppercase text-sm">{t('playlist.title')}</h2>
            {editedQueue && (
              <p className="text-2xs text-accent mt-0.5">{t('playlist.editingActive')}</p>
            )}
          </div>
          <button onClick={onClose} className="text-ink3 hover:text-ink transition-colors" aria-label={t('playlist.close')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Filters */}
          <div className="p-4 flex flex-col gap-3 border-b border-border-subtle">
            <label className="flex flex-col gap-1">
              <span className="text-2xs text-accent tracking-widest uppercase">{t('filters.bluesStyle')}</span>
              <select
                value={filters.style ?? ''}
                onChange={(e) => patch({ style: e.target.value || null })}
                className="text-ui bg-bg-subtle border border-border-subtle rounded px-2 py-1.5 text-ink focus:border-accent focus:outline-none"
              >
                <option value="">{t('playlist.anyStyle')}</option>
                {availableStyles.map((s) => (
                  <option key={s} value={s}>{t(`styles.${s}`, s)}</option>
                ))}
              </select>
            </label>

            {/* Active years */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-2xs text-accent tracking-widest uppercase">{t('filters.activeYears')}</span>
                <span className="text-2xs text-ink3">{yearRange[0]} – {yearRange[1]}</span>
              </div>
              {/* Two thumbs on one track */}
              <div className="relative h-4 flex items-center">
                <input
                  type="range" min={minYear} max={maxYear} value={yearRange[0]}
                  onChange={(e) => patch({ yearRange: [Math.min(parseInt(e.target.value), yearRange[1] - 1), yearRange[1]] })}
                  className="year-range-slider absolute w-full h-1"
                  style={{ zIndex: 3 }}
                  aria-label={t('playlist.yearFrom')}
                />
                <input
                  type="range" min={minYear} max={maxYear} value={yearRange[1]}
                  onChange={(e) => patch({ yearRange: [yearRange[0], Math.max(parseInt(e.target.value), yearRange[0] + 1)] })}
                  className="year-range-slider absolute w-full h-1"
                  style={{ zIndex: 3 }}
                  aria-label={t('playlist.yearTo')}
                />
                <div className="absolute w-full h-1 rounded bg-border-subtle" style={{ zIndex: 1 }}>
                  <div
                    className="absolute h-full rounded bg-accent/50"
                    style={{
                      left: `${((yearRange[0] - minYear) / (maxYear - minYear)) * 100}%`,
                      right: `${((maxYear - yearRange[1]) / (maxYear - minYear)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {user && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={filters.favoritesOnly} onChange={(e) => patch({ favoritesOnly: e.target.checked })} />
                <span className="text-label text-ink3">{t('filters.showFavoritesOnly')}</span>
              </label>
            )}

            {/* Restrict to one musician's network — pick any musician, not just the selected one */}
            <div className="flex flex-col gap-1">
              <span className="text-2xs text-accent tracking-widest uppercase">{t('playlist.relatedTo')}</span>
              {relatedTo ? (
                <div className="flex items-center gap-2 bg-bg-subtle border border-border-subtle rounded px-2 py-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: getStyleHex(relatedTo.bluesStyle) }} />
                  <span className="text-ui text-ink flex-1 truncate">{relatedTo.name}</span>
                  <button
                    onClick={() => patch({ relatedToId: null })}
                    className="text-ink3 hover:text-ink shrink-0"
                    aria-label={t('playlist.clearRelatedTo')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <SearchInput
                    value={relatedSearch}
                    onChange={setRelatedSearch}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && relatedMatches[0]) {
                        patch({ relatedToId: relatedMatches[0].id });
                        setRelatedSearch('');
                      }
                      if (e.key === 'Escape') setRelatedSearch('');
                    }}
                    placeholder={t('playlist.anyMusician')}
                  />
                  {relatedMatches.length > 0 && (
                    <div className="absolute top-full mt-1 left-0 right-0 bg-bg-subtle border border-border-subtle rounded-lg overflow-hidden shadow-xl z-50 max-h-56 overflow-y-auto">
                      {relatedMatches.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => { patch({ relatedToId: m.id }); setRelatedSearch(''); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-bg-hover transition-colors"
                        >
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: getStyleHex(m.bluesStyle) }} />
                          <span className="text-ui text-ink flex-1 truncate">{m.name}</span>
                          <span className="text-2xs text-ink3 shrink-0">{m.activeFrom}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Direction */}
            <div className="flex flex-col gap-1">
              <span className="text-2xs text-accent tracking-widest uppercase">{t('playlist.direction')}</span>
              <div className="flex items-center bg-bg/50 border border-border-subtle rounded-lg p-0.5 gap-0.5">
                {([
                  { id: 'chronological', label: t('playlist.forward') },
                  { id: 'reverse', label: t('playlist.backward') },
                ] as const).map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => patch({ order: id })}
                    className={`flex-1 px-3 py-1 rounded text-2xs font-semibold tracking-wide uppercase transition-all ${filters.order === id ? 'bg-accent text-bg' : 'text-ink3 hover:text-ink'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Size */}
            <div className="flex flex-col gap-1">
              <span className="text-2xs text-accent tracking-widest uppercase">{t('playlist.length')}</span>
              <div className="flex items-center bg-bg/50 border border-border-subtle rounded-lg p-0.5 gap-0.5">
                {PLAYLIST_SIZES.map((n) => (
                  <button
                    key={n}
                    onClick={() => patch({ size: n })}
                    className={`flex-1 px-3 py-1 rounded text-2xs font-semibold tracking-wide uppercase transition-all ${filters.size === n ? 'bg-accent text-bg' : 'text-ink3 hover:text-ink'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="p-2">
            {queue.length === 0 ? (
              <p className="text-ui text-ink3 text-center py-8">{t('playlist.empty')}</p>
            ) : (
              <ol className="flex flex-col">
                {queue.map((m, i) => (
                  <li key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-bg-hover group">
                    <span className="text-2xs text-ink3 w-6 shrink-0 tabular-nums">{i + 1}</span>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: getStyleHex(m.bluesStyle) }} />
                    <span className="text-ui text-ink flex-1 truncate">{m.name}</span>
                    <span className="text-2xs text-ink3 shrink-0">{m.activeFrom}</span>
                    <button
                      onClick={() => setRemoved((prev) => new Set(prev).add(m.id))}
                      className="text-ink3 hover:text-accent2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0"
                      aria-label={t('playlist.remove', { name: m.name })}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border-subtle shrink-0">
          <span className="text-2xs text-ink3">{t('playlist.count', { count: queue.length })}</span>
          <button
            onClick={() => { setRemoved(new Set()); setEditedQueue(null); setReroll((n) => n + 1); }}
            className="mr-auto flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-ui text-ink3 hover:text-ink transition-colors"
            title={t('playlist.shuffle')}
          >
            <Shuffle className="w-4 h-4" />
          </button>

          <button
            onClick={handleShare}
            disabled={queue.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-ui text-ink3 hover:text-ink hover:border-border-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {shareDone ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
            {shareDone ? t('playlist.linkCopied') : t('playlist.share')}
          </button>

          {/* Save — as a YouTube playlist, or into the app */}
          <div className="relative">
            <button
              onClick={() => setSaveOpen((o) => !o)}
              disabled={queue.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-ui text-ink3 hover:text-ink hover:border-border-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Bookmark className="w-4 h-4" />
              {t('playlist.save')}
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>
            {saveOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSaveOpen(false)} />
                <div className="absolute bottom-full right-0 mb-1 z-50 w-60 bg-bg border border-border-subtle rounded-lg shadow-xl overflow-hidden">
                  {youtubeUrl && (
                    <a
                      href={youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setSaveOpen(false)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-ui text-ink hover:bg-bg-hover transition-colors"
                    >
                      <Youtube className="w-4 h-4 shrink-0 text-ink3" />
                      {t('playlist.saveToYoutube')}
                    </a>
                  )}
                  <button
                    onClick={handleSaveToList}
                    disabled={!user || saving}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-ui text-ink hover:bg-bg-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ListPlus className="w-4 h-4 shrink-0 text-ink3" />
                    {user ? t('playlist.saveToLists') : t('playlist.saveNeedsSignIn')}
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => onPlay(queue)}
            disabled={queue.length === 0}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent text-bg text-ui font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" />
            {t('playlist.play')}
          </button>
        </div>

        {savedMessage && (
          <p className="px-4 pb-3 -mt-1 text-2xs text-accent shrink-0">{savedMessage}</p>
        )}
      </div>
    </div>
  );
}

/** Compact transport shown while a playlist is playing. */
export function PlaylistBar({
  queue,
  index,
  onSkip,
  onStop,
  onSelect,
  onEdit,
}: {
  queue: Musician[];
  index: number;
  onSkip: () => void;
  onStop: () => void;
  onSelect: (m: Musician) => void;
  /** Reopen this exact queue in the wizard to edit and save it */
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = queue[index];
  if (!current) return null;

  return (
    // Sits above the timeline's hover tooltip and the mobile toolbar
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[110] max-w-[95vw]">
      {open && (
        <div className="mb-2 w-[min(22rem,90vw)] bg-bg/95 backdrop-blur-sm border border-border-subtle rounded-lg shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle">
            <ListMusic className="w-4 h-4 text-accent shrink-0" />
            <span className="text-2xs text-accent tracking-widest uppercase flex-1">{t('playlist.activePlaylist')}</span>
            <span className="text-2xs text-ink3 tabular-nums">{t('playlist.count', { count: queue.length })}</span>
            <button
              onClick={onEdit}
              className="flex items-center gap-1 px-2 py-0.5 rounded border border-border-subtle text-2xs font-semibold uppercase tracking-wide text-ink3 hover:text-ink hover:border-border-hover transition-colors"
              title={t('playlist.editActive')}
            >
              <Pencil className="w-3 h-3" />
              {t('playlist.edit')}
            </button>
          </div>
          <ol className="max-h-64 overflow-y-auto p-1">
            {queue.map((m, i) => (
              <li key={m.id}>
                <button
                  onClick={() => onSelect(m)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-bg-hover ${i === index ? 'bg-bg-hover' : ''}`}
                >
                  <span className="text-2xs text-ink3 w-6 shrink-0 tabular-nums">{i + 1}</span>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getStyleHex(m.bluesStyle) }} />
                  <span className={`text-ui flex-1 truncate ${i === index ? 'text-accent font-semibold' : 'text-ink'}`}>{m.name}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="flex items-center gap-2 bg-bg/95 backdrop-blur-sm border border-accent/60 rounded-full pl-2 pr-2 py-1.5 shadow-xl">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 shrink-0 pl-2 pr-2 py-0.5 rounded-full border border-border-subtle text-2xs font-semibold uppercase tracking-wide text-ink3 hover:text-ink hover:border-border-hover transition-colors"
          title={open ? t('playlist.hideQueue') : t('playlist.showQueue')}
        >
          <ListMusic className="w-3.5 h-3.5" />
          <span className="tabular-nums">{index + 1}/{queue.length}</span>
          {open ? <ChevronDown className="w-3 h-3 opacity-70" /> : <ChevronUp className="w-3 h-3 opacity-70" />}
        </button>
        <span className="text-ui text-ink truncate max-w-[40vw] sm:max-w-xs">{current.name}</span>
        <button onClick={onSkip} className="text-ink3 hover:text-ink shrink-0 p-1" aria-label={t('playlist.skip')}>
          <SkipForward className="w-4 h-4" />
        </button>
        <button onClick={onStop} className="text-ink3 hover:text-accent2 shrink-0 p-1" aria-label={t('playlist.close')}>
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
