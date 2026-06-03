import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Uploads a brand logo to the `brand-logos` bucket and reports the public URL
 * up via onChange. Storing as `{brandSlugOrId}/{timestamp}.{ext}` keeps old
 * versions around (cheap) and avoids cache headaches.
 *
 * Props:
 *   value     — current logo URL (or empty)
 *   onChange  — called with the new public URL (or null on remove)
 *   pathKey   — folder name in the bucket. Pass the brand slug if known,
 *               otherwise a temp id (e.g. `new-${Date.now()}`).
 *   size      — 'sm' (40px) | 'md' (64px), default 'md'
 */
export default function BrandLogoUploader({ value, onChange, pathKey, size = 'md' }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  const dim = size === 'sm' ? 'w-10 h-10' : 'w-16 h-16'

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)

    if (!file.type.startsWith('image/')) {
      setError('Pick an image file.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo must be under 2 MB.')
      return
    }

    setUploading(true)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `${pathKey || 'misc'}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('brand-logos')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage
        .from('brand-logos')
        .getPublicUrl(path)
      onChange(publicUrl)
    } catch (err) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function handleRemove() {
    onChange(null)
    setError(null)
  }

  return (
    <div className="flex items-center gap-3">
      <div className={`${dim} rounded-lg border border-surface-200 bg-surface-50 flex items-center justify-center overflow-hidden flex-shrink-0`}>
        {value ? (
          <img src={value} alt="Logo" className="w-full h-full object-contain" />
        ) : (
          <svg className="w-5 h-5 text-ink-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="btn-secondary btn-sm"
          >
            {uploading ? 'Uploading…' : value ? 'Replace' : 'Upload logo'}
          </button>
          {value && !uploading && (
            <button
              type="button"
              onClick={handleRemove}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Remove
            </button>
          )}
        </div>
        <p className="text-[11px] text-ink-400">PNG or SVG, square preferred, under 2 MB.</p>
        {error && <p className="text-[11px] text-red-600">{error}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  )
}
