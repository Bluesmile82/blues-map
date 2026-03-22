import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Musician, Album, SpentTimePlace } from '../types';
import { STYLE_COLORS, getStyleColor, CANONICAL_INSTRUMENTS, getInstrumentColor } from '../utils/colors';
import MusicianSelect from './MusicianSelect';

const BLUES_STYLES = Object.keys(STYLE_COLORS);

interface EditPanelProps {
  musician: Musician;
  musicians: Musician[];
  onClose: () => void;
  onSave: (updated: Musician) => Promise<void> | void;
  onDelete?: (musicianId: string) => void;
  isNew?: boolean;
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

interface ValidationErrors {
  name?: string;
  description?: string;
  image?: string;
  birthDate?: string;
  birthPlace?: string;
  birthCoords?: string;
  activeFrom?: string;
  instrument?: string;
  bluesStyle?: string;
  youtubeLink?: string;
}

function validateForm(formData: Musician, t: (key: string) => string): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!formData.name.trim()) errors.name = t('editPanel.nameRequired');
  if (!formData.description.trim()) errors.description = t('editPanel.descriptionRequired');
  if (!formData.image.trim()) errors.image = t('editPanel.imageRequired');
  if (!formData.birthDate.trim()) errors.birthDate = t('editPanel.birthDateRequired');
  if (!formData.birthPlace.trim()) errors.birthPlace = t('editPanel.birthPlaceRequired');
  if (!formData.activeFrom.trim()) errors.activeFrom = t('editPanel.activeFromRequired');
  if (!formData.instrument.trim()) errors.instrument = t('editPanel.instrumentRequired');
  if (!formData.bluesStyle) errors.bluesStyle = t('editPanel.bluesStyleRequired');
  if (formData.birthCoords[0] === 0 && formData.birthCoords[1] === 0) {
    errors.birthCoords = t('editPanel.birthCoordsRequired');
  }
  if (formData.youtubeLink && !/^https?:\/\/.+/.test(formData.youtubeLink)) {
    errors.youtubeLink = t('editPanel.invalidUrl');
  }
  return errors;
}

export default function EditPanel({ musician, musicians, onClose, onSave, onDelete, isNew = false }: EditPanelProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Musician>({ ...musician });
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [imageDownloadError, setImageDownloadError] = useState('');

  // Raw string state for coordinate fields (allows partial typing)
  const [birthCoordsRaw, setBirthCoordsRaw] = useState(
    musician.birthCoords.every(c => c === 0) ? '' : musician.birthCoords.join(', ')
  );
  const [deathCoordsRaw, setDeathCoordsRaw] = useState(
    musician.deathCoords ? musician.deathCoords.join(', ') : ''
  );

    useEffect(() => {
      setFormData({
        ...musician,
        playedWith: musician.playedWith ?? [],
        influencedBy: musician.influencedBy ?? [],
        influences: musician.influences ?? []
      });
      setBirthCoordsRaw(musician.birthCoords.every(c => c === 0) ? '' : musician.birthCoords.join(', '));
      setDeathCoordsRaw(musician.deathCoords ? musician.deathCoords.join(', ') : '');
    }, [musician]);

  const handleChange = (field: keyof Musician, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setTouched(prev => new Set(prev).add(field));
  };

  const handleDownloadImage = async () => {
    const url = formData.image.trim();
    if (!url.startsWith('http')) return;
    const id = isNew ? generateSlug(formData.name) : formData.id;
    if (!id) return;
    setIsDownloadingImage(true);
    setImageDownloadError('');
    try {
      const res = await fetch('/api/musicians/download-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Download failed');
      handleChange('image', data.path);
    } catch (e) {
      setImageDownloadError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setIsDownloadingImage(false);
    }
  };

  const handleBlur = (field: string) => {
    setTouched(prev => new Set(prev).add(field));
  };

  const parseCoordsString = (raw: string): [number, number] | null => {
    const parts = raw.split(',').map(s => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return [parts[0], parts[1]];
    }
    return null;
  };

  const handleBirthCoordsBlur = () => {
    handleBlur('birthCoords');
    const parsed = parseCoordsString(birthCoordsRaw);
    if (parsed) handleChange('birthCoords', parsed);
  };

  const handleDeathCoordsBlur = () => {
    const parsed = parseCoordsString(deathCoordsRaw);
    if (parsed) handleChange('deathCoords', parsed);
    else if (!deathCoordsRaw.trim()) handleChange('deathCoords', null);
  };

  const handleSubmit = async () => {
    // Commit coords from raw strings before validating
    const birthCoords = parseCoordsString(birthCoordsRaw) ?? formData.birthCoords;
    const deathCoords = deathCoordsRaw.trim() ? (parseCoordsString(deathCoordsRaw) ?? formData.deathCoords) : null;
    const updatedForm = { ...formData, birthCoords, deathCoords };

    const validationErrors = validateForm(updatedForm, t);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      // Mark all fields as touched to show errors
      setTouched(new Set(Object.keys(validationErrors)));
      return;
    }

    setIsSaving(true);
    setSaveStatus('');

    try {
      let musicianToSave = { ...updatedForm };
      if (isNew) {
        musicianToSave.id = generateSlug(updatedForm.name);
      }
      await onSave(musicianToSave);
      setSaveStatus(isNew ? t('editPanel.createdSuccess') : t('editPanel.savedSuccess'));
      setTimeout(() => onClose(), 800);
    } catch (error) {
      setSaveStatus(t('editPanel.saveError'));
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (onDelete && formData.id && confirm(t('editPanel.confirmDelete'))) {
      onDelete(formData.id);
    }
  };

  const fieldError = (field: string) => touched.has(field) ? (errors as Record<string, string>)[field] : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-bg-elevated border border-border-subtle rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-bg-hover">
          <h2 className="text-xl font-bold text-ink">{isNew ? t('editPanel.newMusician') : t('editPanel.editMusician')}</h2>
          <div className="flex items-center gap-3">
            {!isNew && onDelete && (
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded border border-red-900/50 transition-colors"
              >
                {t('editPanel.delete')}
              </button>
            )}
            <button onClick={onClose} className="text-ink3 hover:text-ink text-2xl leading-none">✕</button>
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Basic Info */}
          <section className="space-y-4">
            <h3 className="text-accent text-sm font-semibold uppercase tracking-wide">{t('editPanel.basicInfo')}</h3>

            <div className="grid grid-cols-2 gap-4">
              <Field label={t('editPanel.name')} required error={fieldError('name')}>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  onBlur={() => handleBlur('name')}
                  placeholder={t('editPanel.namePlaceholder')}
                  className={inputClass(fieldError('name'))}
                />
              </Field>

              <Field label={t('editPanel.idAutoGenerated')}>
                <input
                  type="text"
                  value={isNew ? generateSlug(formData.name) : formData.id}
                  disabled
                  className="w-full px-3 py-2 bg-bg/50 border border-border-subtle rounded text-ink3 text-sm cursor-not-allowed"
                />
              </Field>
            </div>

            <Field label={t('editPanel.description')} required error={fieldError('description')}>
              <textarea
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                onBlur={() => handleBlur('description')}
                rows={3}
                placeholder={t('editPanel.descriptionPlaceholder')}
                className={inputClass(fieldError('description')) + ' resize-none'}
              />
            </Field>
          </section>

          {/* Image */}
          <section className="space-y-4">
            <h3 className="text-accent text-sm font-semibold uppercase tracking-wide">{t('editPanel.image')}</h3>
             <Field label={t('editPanel.imageUrl')} required error={fieldError('image')}>
               <div className="flex gap-2">
                 <input
                   type="url"
                   value={formData.image}
                   onChange={(e) => handleChange('image', e.target.value)}
                   onBlur={() => handleBlur('image')}
                   placeholder="https://..."
                   className={inputClass(fieldError('image')) + ' flex-1'}
                 />
                 {formData.image.startsWith('http') && (
                   <button
                     type="button"
                     onClick={handleDownloadImage}
                     disabled={isDownloadingImage}
                     title="Download and save as local thumbnail"
                     className="shrink-0 px-3 py-2 text-xs bg-bg-hover border border-border-subtle rounded text-ink3 hover:text-ink hover:border-accent disabled:opacity-50 transition-colors"
                   >
                     {isDownloadingImage ? t('editPanel.saving') : t('editPanel.saveLocal')}
                   </button>
                 )}
               </div>
               {imageDownloadError && (
                 <p className="text-red-400 text-xs mt-1">{imageDownloadError}</p>
               )}
             </Field>

             <Field label={t('editPanel.imageSource')} error={fieldError('image_source' as keyof Musician)}>
               <input
                 type="text"
                 value={formData.image_source || ''}
                 onChange={(e) => handleChange('image_source' as keyof Musician, e.target.value)}
                 placeholder={t('editPanel.imageSourcePlaceholder')}
                 className={inputClass(fieldError('image_source' as keyof Musician))}
               />
               <p className="text-ink3 text-xs mt-1">{t('editPanel.imageSourceHint')}</p>
             </Field>

             {formData.image && (
               <div className="mt-2">
                 <img
                   src={formData.image}
                   alt={formData.name}
                   className="w-20 h-20 rounded object-cover border border-border-subtle"
                   onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                 />
               </div>
             )}
          </section>

          {/* Dates & Locations */}
          <section className="space-y-4">
            <h3 className="text-accent text-sm font-semibold uppercase tracking-wide">{t('editPanel.datesAndLocations')}</h3>

            <div className="grid grid-cols-2 gap-4">
              <Field label={t('editPanel.birthDate')} required error={fieldError('birthDate')}>
                <input
                  type="date"
                  value={formData.birthDate}
                  onChange={(e) => handleChange('birthDate', e.target.value)}
                  onBlur={() => handleBlur('birthDate')}
                  className={inputClass(fieldError('birthDate'))}
                />
              </Field>

              <Field label={t('editPanel.birthPlace')} required error={fieldError('birthPlace')}>
                <input
                  type="text"
                  value={formData.birthPlace}
                  onChange={(e) => handleChange('birthPlace', e.target.value)}
                  onBlur={() => handleBlur('birthPlace')}
                  placeholder={t('editPanel.birthPlacePlaceholder')}
                  className={inputClass(fieldError('birthPlace'))}
                />
              </Field>
            </div>

            <Field
              label={t('editPanel.birthCoordinates')}
              required
              error={fieldError('birthCoords')}
              hint={t('editPanel.birthCoordinatesHint')}
            >
              <input
                type="text"
                value={birthCoordsRaw}
                onChange={(e) => setBirthCoordsRaw(e.target.value)}
                onBlur={handleBirthCoordsBlur}
                placeholder="-90.2557, 32.2988"
                className={inputClass(fieldError('birthCoords'))}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label={t('editPanel.deathDate')} hint={t('editPanel.deathDateHint')}>
                <input
                  type="date"
                  value={formData.deathDate || ''}
                  onChange={(e) => handleChange('deathDate', e.target.value || null)}
                  className={inputClass()}
                />
              </Field>

              <Field label={t('editPanel.deathPlace')} hint={t('editPanel.deathPlaceHint')}>
                <input
                  type="text"
                  value={formData.deathPlace || ''}
                  onChange={(e) => handleChange('deathPlace', e.target.value || null)}
                  placeholder={t('editPanel.deathPlacePlaceholder')}
                  className={inputClass()}
                />
              </Field>
            </div>

            <Field label={t('editPanel.deathCoordinates')} hint={t('editPanel.deathCoordinatesHint')}>
              <input
                type="text"
                value={deathCoordsRaw}
                onChange={(e) => setDeathCoordsRaw(e.target.value)}
                onBlur={handleDeathCoordsBlur}
                placeholder="-87.6298, 41.8781"
                className={inputClass()}
              />
            </Field>

            <Field label={t('editPanel.activeFromYear')} required error={fieldError('activeFrom')}>
              <input
                type="number"
                value={formData.activeFrom}
                onChange={(e) => handleChange('activeFrom', e.target.value)}
                onBlur={() => handleBlur('activeFrom')}
                placeholder={t('editPanel.activeFromPlaceholder')}
                min={1800}
                max={2025}
                className={inputClass(fieldError('activeFrom'))}
              />
            </Field>
          </section>

          {/* Music Info */}
          <section className="space-y-4">
            <h3 className="text-accent text-sm font-semibold uppercase tracking-wide">{t('editPanel.musicInfo')}</h3>

            <div className="grid grid-cols-2 gap-4">
              <Field label={t('editPanel.primaryInstrument') || t('editPanel.instruments')} required error={fieldError('instrument')} hint={t('editPanel.primaryInstrumentHint') || ''}>
                <select
                  value={formData.instrument}
                  onChange={(e) => {
                    const newPrimary = e.target.value;
                    handleChange('instrument', newPrimary);
                    if (formData.secondaryInstruments?.includes(newPrimary)) {
                      handleChange('secondaryInstruments', formData.secondaryInstruments.filter(s => s !== newPrimary));
                    }
                  }}
                  className={inputClass(fieldError('instrument'))}
                >
                  <option value="">{t('editPanel.selectInstrument') || 'Select an instrument…'}</option>
                  {CANONICAL_INSTRUMENTS.map(inst => (
                    <option key={inst} value={inst}>{t(`instruments.${inst}`, inst)}</option>
                  ))}
                </select>
              </Field>

              <Field label={t('editPanel.primaryStyle')} required error={fieldError('bluesStyle')} hint={t('editPanel.primaryStyleHint')}>
                <select
                  value={formData.bluesStyle}
                  onChange={(e) => {
                    const newPrimary = e.target.value;
                    // Remove new primary from secondary styles if present
                    handleChange('bluesStyle', newPrimary);
                    if (formData.secondaryStyles?.includes(newPrimary)) {
                      handleChange('secondaryStyles', formData.secondaryStyles.filter(s => s !== newPrimary));
                    }
                  }}
                  onBlur={() => handleBlur('bluesStyle')}
                  className={inputClass(fieldError('bluesStyle'))}
                >
                  <option value="">{t('editPanel.selectStyle')}</option>
                  {BLUES_STYLES.map(style => (
                    <option key={style} value={style}>{t(`styles.${style}`, style)}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label={t('editPanel.secondaryStyles')} hint={t('editPanel.secondaryStylesHint')}>
              <div className="flex flex-wrap gap-2 mt-1">
                {BLUES_STYLES.filter(s => s !== formData.bluesStyle).map(style => {
                  const [r, g, b] = getStyleColor(style) as [number, number, number];
                  const isSelected = formData.secondaryStyles?.includes(style) ?? false;
                  return (
                    <button
                      key={style}
                      type="button"
                      onClick={() => {
                        const current = formData.secondaryStyles ?? [];
                        handleChange('secondaryStyles', isSelected
                          ? current.filter(s => s !== style)
                          : [...current, style]
                        );
                      }}
                      style={{
                        color: isSelected ? `rgb(${r},${g},${b})` : '#6b5a45',
                        border: `1px solid ${isSelected ? `rgba(${r},${g},${b},0.6)` : '#2a1e0e'}`,
                        background: isSelected ? `rgba(${r},${g},${b},0.12)` : 'transparent',
                      }}
                      className="px-2.5 py-1 rounded-full text-xs font-medium transition-all hover:opacity-80"
                    >
                      {t(`styles.${style}`, style)}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label={t('editPanel.secondaryInstruments') || 'Secondary Instruments'} hint={t('editPanel.secondaryInstrumentsHint') || 'Click to toggle additional instruments this musician played'}>
              <div className="flex flex-wrap gap-2 mt-1">
                {CANONICAL_INSTRUMENTS.filter(i => i !== formData.instrument).map(inst => {
                  const [r, g, b] = getInstrumentColor(inst) as [number, number, number];
                  const isSelected = formData.secondaryInstruments?.includes(inst) ?? false;
                  return (
                    <button
                      key={inst}
                      type="button"
                      onClick={() => {
                        const current = formData.secondaryInstruments ?? [];
                        handleChange('secondaryInstruments', isSelected
                          ? current.filter(s => s !== inst)
                          : [...current, inst]
                        );
                      }}
                      style={{
                        color: isSelected ? `rgb(${r},${g},${b})` : '#6b5a45',
                        border: `1px solid ${isSelected ? `rgba(${r},${g},${b},0.6)` : '#2a1e0e'}`,
                        background: isSelected ? `rgba(${r},${g},${b},0.12)` : 'transparent',
                      }}
                      className="px-2.5 py-1 rounded-full text-xs font-medium transition-all hover:opacity-80"
                    >
                      {t(`instruments.${inst}`, inst)}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label={t('editPanel.youtubeLink')} error={fieldError('youtubeLink')} hint={t('editPanel.youtubeLinkHint')}>
              <input
                type="url"
                value={formData.youtubeLink}
                onChange={(e) => handleChange('youtubeLink', e.target.value)}
                onBlur={() => handleBlur('youtubeLink')}
                placeholder="https://www.youtube.com/watch?v=..."
                className={inputClass(fieldError('youtubeLink'))}
              />
            </Field>
          </section>

          {/* Albums */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-accent text-sm font-semibold uppercase tracking-wide">{t('editPanel.albums')}</h3>
              <button
                type="button"
                onClick={() => handleChange('albums', [...formData.albums, { name: '', youtubeLink: '' } as Album])}
                className="text-xs px-3 py-1 bg-accent text-bg rounded hover:bg-accent/90 transition-colors"
              >
                {t('editPanel.addAlbum')}
              </button>
            </div>
            <div className="space-y-2">
              {formData.albums.map((album, index) => (
                <div key={index} className="flex gap-2 items-start p-3 bg-bg border border-border-subtle rounded">
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={album.name}
                      onChange={(e) => {
                        const updated = [...formData.albums];
                        updated[index] = { ...album, name: e.target.value };
                        handleChange('albums', updated);
                      }}
                      placeholder={t('editPanel.albumName')}
                      className={inputClass()}
                    />
                    <input
                      type="url"
                      value={album.youtubeLink}
                      onChange={(e) => {
                        const updated = [...formData.albums];
                        updated[index] = { ...album, youtubeLink: e.target.value };
                        handleChange('albums', updated);
                      }}
                      placeholder={t('editPanel.albumYoutubeLink')}
                      className={inputClass()}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleChange('albums', formData.albums.filter((_, i) => i !== index))}
                    className="text-ink3 hover:text-red-400 text-sm mt-2"
                  >
                    {t('editPanel.remove')}
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Spent Time Places */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-accent text-sm font-semibold uppercase tracking-wide">{t('editPanel.spentTimePlaces')}</h3>
              <button
                type="button"
                onClick={() => handleChange('spentTimePlaces', [...formData.spentTimePlaces, { place: '', coords: [0, 0] } as SpentTimePlace])}
                className="text-xs px-3 py-1 bg-accent text-bg rounded hover:bg-accent/90 transition-colors"
              >
                {t('editPanel.addPlace')}
              </button>
            </div>
            <div className="space-y-2">
              {formData.spentTimePlaces.map((place, index) => (
                <SpentPlaceRow
                  key={index}
                  place={place}
                  onChange={(updated) => {
                    const newPlaces = [...formData.spentTimePlaces];
                    newPlaces[index] = updated;
                    handleChange('spentTimePlaces', newPlaces);
                  }}
                  onRemove={() => handleChange('spentTimePlaces', formData.spentTimePlaces.filter((_, i) => i !== index))}
                />
              ))}
            </div>
          </section>

          {/* Influences */}
          <section className="space-y-4">
            <h3 className="text-accent text-sm font-semibold uppercase tracking-wide">{t('editPanel.influences')}</h3>

            <MusicianSelect
              label={t('editPanel.influencedByLabel')}
              selected={formData.influences}
              onChange={(ids) => handleChange('influences', ids)}
              musicians={musicians}
              placeholder={t('editPanel.influencedByPlaceholder')}
            />

            <MusicianSelect
              label={t('editPanel.influencedLabel')}
              selected={formData.influencedBy}
              onChange={(ids) => handleChange('influencedBy', ids)}
              musicians={musicians}
              placeholder={t('editPanel.influencedPlaceholder')}
            />

            <MusicianSelect
              label={t('editPanel.playedWithLabel')}
              selected={formData.playedWith}
              onChange={(ids) => handleChange('playedWith', ids)}
              musicians={musicians}
              placeholder={t('editPanel.playedWithPlaceholder')}
            />
          </section>

          {/* Status */}
          <section className="space-y-4">
            <h3 className="text-accent text-sm font-semibold uppercase tracking-wide">{t('editPanel.status')}</h3>
            <label className="flex items-center gap-2 text-ink2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={formData.incomplete ?? false}
                onChange={(e) => handleChange('incomplete', e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              {t('editPanel.markIncomplete')}
            </label>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-subtle bg-bg-hover">
          <div className="text-sm">
            {saveStatus && (
              <span className={saveStatus.includes('Error') ? 'text-red-400' : 'text-green-400'}>
                {saveStatus}
              </span>
            )}
            {Object.keys(errors).length > 0 && touched.size > 0 && !saveStatus && (
              <span className="text-red-400 text-xs">{t('editPanel.fixErrors')}</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-ink3 text-sm font-medium hover:text-ink disabled:opacity-50 transition-colors"
            >
              {t('editPanel.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSaving}
              className="px-6 py-2 bg-accent text-bg text-sm font-medium rounded hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? (isNew ? t('editPanel.creating') : t('editPanel.savingStatus')) : (isNew ? t('editPanel.createMusician') : t('editPanel.saveChanges'))}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function inputClass(error?: string) {
  return `w-full px-3 py-2 bg-bg border ${error ? 'border-red-500' : 'border-border-subtle'} rounded text-ink text-sm focus:border-accent focus:outline-none`;
}

function Field({ label, required, error, hint, children }: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-ink3 text-sm mb-1">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-ink3 text-xs mt-1">{hint}</p>}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}

function SpentPlaceRow({ place, onChange, onRemove }: {
  place: SpentTimePlace;
  onChange: (updated: SpentTimePlace) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [coordsRaw, setCoordsRaw] = useState(
    place.coords.every(c => c === 0) ? '' : place.coords.join(', ')
  );

  const handleCoordsBlur = () => {
    const parts = coordsRaw.split(',').map(s => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      onChange({ ...place, coords: [parts[0], parts[1]] });
    }
  };

  return (
    <div className="flex gap-2 items-start p-3 bg-bg border border-border-subtle rounded">
      <div className="flex-1 space-y-2">
        <input
          type="text"
          value={place.place}
          onChange={(e) => onChange({ ...place, place: e.target.value })}
          placeholder={t('editPanel.placeName')}
          className="w-full px-3 py-2 bg-bg-elevated border border-border-subtle rounded text-ink text-sm focus:border-accent focus:outline-none"
        />
        <input
          type="text"
          value={coordsRaw}
          onChange={(e) => setCoordsRaw(e.target.value)}
          onBlur={handleCoordsBlur}
          placeholder={t('editPanel.coordinatesPlaceholder')}
          className="w-full px-3 py-2 bg-bg-elevated border border-border-subtle rounded text-ink text-sm focus:border-accent focus:outline-none"
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="text-ink3 hover:text-red-400 text-sm mt-2"
      >
        {t('editPanel.remove')}
      </button>
    </div>
  );
}
