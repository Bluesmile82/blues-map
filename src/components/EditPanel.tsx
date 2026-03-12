import { useState, useEffect } from 'react';
import type { Musician, Album, SpentTimePlace } from '../types';
import { STYLE_COLORS, getStyleColor } from '../utils/colors';

const BLUES_STYLES = Object.keys(STYLE_COLORS);

interface EditPanelProps {
  musician: Musician;
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

function validateForm(formData: Musician): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!formData.name.trim()) errors.name = 'Name is required';
  if (!formData.description.trim()) errors.description = 'Description is required';
  if (!formData.image.trim()) errors.image = 'Image URL is required';
  if (!formData.birthDate.trim()) errors.birthDate = 'Birth date is required';
  if (!formData.birthPlace.trim()) errors.birthPlace = 'Birth place is required';
  if (!formData.activeFrom.trim()) errors.activeFrom = 'Active from year is required';
  if (!formData.instrument.trim()) errors.instrument = 'Instrument is required';
  if (!formData.bluesStyle) errors.bluesStyle = 'Blues style is required';
  if (formData.birthCoords[0] === 0 && formData.birthCoords[1] === 0) {
    errors.birthCoords = 'Birth coordinates are required';
  }
  if (formData.youtubeLink && !/^https?:\/\/.+/.test(formData.youtubeLink)) {
    errors.youtubeLink = 'Must be a valid URL';
  }
  return errors;
}

export default function EditPanel({ musician, onClose, onSave, onDelete, isNew = false }: EditPanelProps) {
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
    setFormData({ ...musician, playedWith: musician.playedWith ?? [] });
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

    const validationErrors = validateForm(updatedForm);
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
      setSaveStatus(isNew ? 'Created successfully!' : 'Saved successfully!');
      setTimeout(() => onClose(), 800);
    } catch (error) {
      setSaveStatus('Error saving. Please try again.');
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (onDelete && formData.id && confirm('Are you sure you want to delete this musician?')) {
      onDelete(formData.id);
    }
  };

  const fieldError = (field: string) => touched.has(field) ? (errors as Record<string, string>)[field] : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#141008] border border-[#2a1e0e] rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a1e0e] bg-[#1a1208]">
          <h2 className="text-xl font-bold text-ink">{isNew ? 'New Musician' : 'Edit Musician'}</h2>
          <div className="flex items-center gap-3">
            {!isNew && onDelete && (
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded border border-red-900/50 transition-colors"
              >
                Delete
              </button>
            )}
            <button onClick={onClose} className="text-ink3 hover:text-ink text-2xl leading-none">✕</button>
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Basic Info */}
          <section className="space-y-4">
            <h3 className="text-accent text-sm font-semibold uppercase tracking-wide">Basic Info</h3>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Name" required error={fieldError('name')}>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  onBlur={() => handleBlur('name')}
                  placeholder="e.g. Robert Johnson"
                  className={inputClass(fieldError('name'))}
                />
              </Field>

              <Field label="ID (auto-generated)">
                <input
                  type="text"
                  value={isNew ? generateSlug(formData.name) : formData.id}
                  disabled
                  className="w-full px-3 py-2 bg-[#0a0805]/50 border border-[#2a1e0e] rounded text-ink3 text-sm cursor-not-allowed"
                />
              </Field>
            </div>

            <Field label="Description" required error={fieldError('description')}>
              <textarea
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                onBlur={() => handleBlur('description')}
                rows={3}
                placeholder="Brief biography..."
                className={inputClass(fieldError('description')) + ' resize-none'}
              />
            </Field>
          </section>

          {/* Image */}
          <section className="space-y-4">
            <h3 className="text-accent text-sm font-semibold uppercase tracking-wide">Image</h3>
             <Field label="Image URL" required error={fieldError('image')}>
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
                     className="shrink-0 px-3 py-2 text-xs bg-[#1a1208] border border-[#2a2a0e] rounded text-ink3 hover:text-ink hover:border-accent disabled:opacity-50 transition-colors"
                   >
                     {isDownloadingImage ? 'Saving…' : '⬇ Save local'}
                   </button>
                 )}
               </div>
               {imageDownloadError && (
                 <p className="text-red-400 text-xs mt-1">{imageDownloadError}</p>
               )}
             </Field>

             <Field label="Image Source" error={fieldError('image_source' as keyof Musician)}>
               <input
                 type="text"
                 value={formData.image_source || ''}
                 onChange={(e) => handleChange('image_source' as keyof Musician, e.target.value)}
                 placeholder="e.g., Wikipedia, Library of Congress"
                 className={inputClass(fieldError('image_source' as keyof Musician))}
               />
               <p className="text-ink3 text-xs mt-1">Source or attribution for the image</p>
             </Field>

             {formData.image && (
               <div className="mt-2">
                 <img
                   src={formData.image}
                   alt={formData.name}
                   className="w-20 h-20 rounded object-cover border border-[#2a1a0e]"
                   onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                 />
               </div>
             )}
          </section>

          {/* Dates & Locations */}
          <section className="space-y-4">
            <h3 className="text-accent text-sm font-semibold uppercase tracking-wide">Dates & Locations</h3>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Birth Date" required error={fieldError('birthDate')}>
                <input
                  type="date"
                  value={formData.birthDate}
                  onChange={(e) => handleChange('birthDate', e.target.value)}
                  onBlur={() => handleBlur('birthDate')}
                  className={inputClass(fieldError('birthDate'))}
                />
              </Field>

              <Field label="Birth Place" required error={fieldError('birthPlace')}>
                <input
                  type="text"
                  value={formData.birthPlace}
                  onChange={(e) => handleChange('birthPlace', e.target.value)}
                  onBlur={() => handleBlur('birthPlace')}
                  placeholder="e.g. Hinds County, Mississippi"
                  className={inputClass(fieldError('birthPlace'))}
                />
              </Field>
            </div>

            <Field
              label="Birth Coordinates (longitude, latitude)"
              required
              error={fieldError('birthCoords')}
              hint="e.g. -90.2557, 32.2988"
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
              <Field label="Death Date" hint="Leave empty if still alive">
                <input
                  type="date"
                  value={formData.deathDate || ''}
                  onChange={(e) => handleChange('deathDate', e.target.value || null)}
                  className={inputClass()}
                />
              </Field>

              <Field label="Death Place" hint="Leave empty if still alive">
                <input
                  type="text"
                  value={formData.deathPlace || ''}
                  onChange={(e) => handleChange('deathPlace', e.target.value || null)}
                  placeholder="e.g. Chicago, Illinois"
                  className={inputClass()}
                />
              </Field>
            </div>

            <Field label="Death Coordinates" hint="longitude, latitude — leave empty if still alive">
              <input
                type="text"
                value={deathCoordsRaw}
                onChange={(e) => setDeathCoordsRaw(e.target.value)}
                onBlur={handleDeathCoordsBlur}
                placeholder="-87.6298, 41.8781"
                className={inputClass()}
              />
            </Field>

            <Field label="Active From (year)" required error={fieldError('activeFrom')}>
              <input
                type="number"
                value={formData.activeFrom}
                onChange={(e) => handleChange('activeFrom', e.target.value)}
                onBlur={() => handleBlur('activeFrom')}
                placeholder="e.g. 1930"
                min={1800}
                max={2025}
                className={inputClass(fieldError('activeFrom'))}
              />
            </Field>
          </section>

          {/* Music Info */}
          <section className="space-y-4">
            <h3 className="text-accent text-sm font-semibold uppercase tracking-wide">Music Info</h3>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Instrument(s)" required error={fieldError('instrument')}>
                <input
                  type="text"
                  value={formData.instrument}
                  onChange={(e) => handleChange('instrument', e.target.value)}
                  onBlur={() => handleBlur('instrument')}
                  placeholder="e.g. Guitar, Vocals"
                  className={inputClass(fieldError('instrument'))}
                />
              </Field>

              <Field label="Primary Style" required error={fieldError('bluesStyle')} hint="Used for color and grouping">
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
                  <option value="">Select a style…</option>
                  {BLUES_STYLES.map(style => (
                    <option key={style} value={style}>{style}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Secondary Styles" hint="Click to toggle additional styles this musician played">
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
                      {style}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="YouTube Link" error={fieldError('youtubeLink')} hint="Main track or performance video">
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
              <h3 className="text-accent text-sm font-semibold uppercase tracking-wide">Albums</h3>
              <button
                type="button"
                onClick={() => handleChange('albums', [...formData.albums, { name: '', youtubeLink: '' } as Album])}
                className="text-xs px-3 py-1 bg-accent text-bg rounded hover:bg-accent/90 transition-colors"
              >
                + Add Album
              </button>
            </div>
            <div className="space-y-2">
              {formData.albums.map((album, index) => (
                <div key={index} className="flex gap-2 items-start p-3 bg-[#0a0805] border border-[#2a1e0e] rounded">
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={album.name}
                      onChange={(e) => {
                        const updated = [...formData.albums];
                        updated[index] = { ...album, name: e.target.value };
                        handleChange('albums', updated);
                      }}
                      placeholder="Album name"
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
                      placeholder="YouTube link (optional)"
                      className={inputClass()}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleChange('albums', formData.albums.filter((_, i) => i !== index))}
                    className="text-ink3 hover:text-red-400 text-sm mt-2"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Spent Time Places */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-accent text-sm font-semibold uppercase tracking-wide">Spent Time Places</h3>
              <button
                type="button"
                onClick={() => handleChange('spentTimePlaces', [...formData.spentTimePlaces, { place: '', coords: [0, 0] } as SpentTimePlace])}
                className="text-xs px-3 py-1 bg-accent text-bg rounded hover:bg-accent/90 transition-colors"
              >
                + Add Place
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
            <h3 className="text-accent text-sm font-semibold uppercase tracking-wide">Influences</h3>
            <Field label="Influenced by (musician IDs, comma-separated)" hint="e.g. muddy-waters, howlin-wolf">
              <textarea
                value={formData.influences.join(', ')}
                onChange={(e) => handleChange('influences', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                rows={2}
                placeholder="muddy-waters, howlin-wolf"
                className={inputClass() + ' resize-none'}
              />
            </Field>
            <Field label="Influenced (musician IDs, comma-separated)" hint="Musicians this person influenced">
              <textarea
                value={formData.influencedBy.join(', ')}
                onChange={(e) => handleChange('influencedBy', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                rows={2}
                placeholder="bb-king, eric-clapton"
                className={inputClass() + ' resize-none'}
              />
            </Field>
            <Field label="Played with (musician IDs, comma-separated)" hint="Musicians this person played with">
              <textarea
                value={formData.playedWith.join(', ')}
                onChange={(e) => handleChange('playedWith', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                rows={2}
                placeholder="bb-king, buddy-guy"
                className={inputClass() + ' resize-none'}
              />
            </Field>
          </section>

          {/* Status */}
          <section className="space-y-4">
            <h3 className="text-accent text-sm font-semibold uppercase tracking-wide">Status</h3>
            <label className="flex items-center gap-2 text-ink2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={formData.incomplete ?? false}
                onChange={(e) => handleChange('incomplete', e.target.checked)}
                className="w-4 h-4 accent-accent"
              />
              Mark as incomplete (hide from visualization)
            </label>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#2a1e0e] bg-[#1a1208]">
          <div className="text-sm">
            {saveStatus && (
              <span className={saveStatus.includes('Error') ? 'text-red-400' : 'text-green-400'}>
                {saveStatus}
              </span>
            )}
            {Object.keys(errors).length > 0 && touched.size > 0 && !saveStatus && (
              <span className="text-red-400 text-xs">Please fix the errors above</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-ink3 text-sm font-medium hover:text-ink disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSaving}
              className="px-6 py-2 bg-accent text-bg text-sm font-medium rounded hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? (isNew ? 'Creating...' : 'Saving...') : (isNew ? 'Create Musician' : 'Save Changes')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function inputClass(error?: string) {
  return `w-full px-3 py-2 bg-[#0a0805] border ${error ? 'border-red-500' : 'border-[#2a1e0e]'} rounded text-ink text-sm focus:border-accent focus:outline-none`;
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
    <div className="flex gap-2 items-start p-3 bg-[#0a0805] border border-[#2a1e0e] rounded">
      <div className="flex-1 space-y-2">
        <input
          type="text"
          value={place.place}
          onChange={(e) => onChange({ ...place, place: e.target.value })}
          placeholder="Place name"
          className="w-full px-3 py-2 bg-[#141008] border border-[#2a1e0e] rounded text-ink text-sm focus:border-accent focus:outline-none"
        />
        <input
          type="text"
          value={coordsRaw}
          onChange={(e) => setCoordsRaw(e.target.value)}
          onBlur={handleCoordsBlur}
          placeholder="Coordinates: longitude, latitude"
          className="w-full px-3 py-2 bg-[#141008] border border-[#2a1e0e] rounded text-ink text-sm focus:border-accent focus:outline-none"
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="text-ink3 hover:text-red-400 text-sm mt-2"
      >
        Remove
      </button>
    </div>
  );
}
