import { useRef } from 'react'
import { Camera, X } from 'lucide-react'
import { useStore } from '../store'
import { Section } from './ui'

/** Notiz und Fotos zu einem Element (z. B. „Leitung hinter Putz, 12 cm unter Decke“). */
export default function NoteSection({ elId }: { elId: string }) {
  const note = useStore((s) => s.project.notes?.[elId])
  const photos = useStore((s) => s.photos)
  const setText = useStore((s) => s.setNoteText)
  const addPhotos = useStore((s) => s.addPhotos)
  const removePhoto = useStore((s) => s.removePhoto)
  const input = useRef<HTMLInputElement>(null)
  const zoom = (url: string) => window.open(url, '_blank')

  return (
    <Section title="Notiz & Fotos">
      <textarea
        className="note-text"
        rows={3}
        placeholder="Notiz, z. B. „vor dem Verputzen“ oder „noch klären“"
        value={note?.text ?? ''}
        onChange={(e) => setText(elId, e.target.value)}
      />
      <div className="note-photos">
        {(note?.photos ?? []).map((id) =>
          photos[id] ? (
            <div key={id} className="note-photo">
              <img src={photos[id]} alt="Foto" onClick={() => zoom(photos[id])} />
              <button className="note-photo-x" aria-label="Foto entfernen" onClick={() => removePhoto(elId, id)}>
                <X size={12} />
              </button>
            </div>
          ) : null,
        )}
        <button className="note-add" onClick={() => input.current?.click()}>
          <Camera size={18} />
          <span>Foto</span>
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            if (files.length) void addPhotos(elId, files)
          }}
        />
      </div>
    </Section>
  )
}
