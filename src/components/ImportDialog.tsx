import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { loadImage, mmPerPxFromScale, openPdf, renderPage, type PdfDoc } from '../lib/pdf'
import { useStore } from '../store'
import { NumberField } from './NumberField'
import SheetSplit from './SheetSplit'
import { Modal, Row } from './ui'

export default function ImportDialog() {
  const file = useStore((s) => s.importFile)
  if (!file) return null
  return <ImportInner key={file.name + file.size + file.lastModified} file={file} />
}

interface Thumb {
  no: number
  url: string
}

function ImportInner({ file }: { file: File }) {
  const close = () => useStore.getState().openImport(null)
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

  const [thumbs, setThumbs] = useState<Thumb[]>([])
  const [numPages, setNumPages] = useState(0)
  const [selected, setSelected] = useState<number[]>([])
  const [denom, setDenom] = useState(100)
  const [sheet, setSheet] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const docRef = useRef<PdfDoc | null>(null)

  // Bilder: sofort importieren
  const single = () => setSingleImg(true)
  const [singleImg, setSingleImg] = useState(false)
  useEffect(() => {
    if (isPdf || !singleImg) return
    let cancelled = false
    ;(async () => {
      setBusy(true)
      try {
        const img = await loadImage(file, 4096)
        if (cancelled) return
        const st = useStore.getState()
        st.setBackground(st.activeFloorId, img.dataUrl, {
          width: img.width,
          height: img.height,
          mmPerPx: 12000 / img.width, // grobe Annahme: ca. 12 m Breite, wird kalibriert
          opacity: 0.7,
          source: file.name,
        })
        st.setTool('calibrate')
        st.showToast('Grundriss geladen. Zwei Punkte mit bekanntem Abstand anklicken, um den Maßstab zu setzen.')
        close()
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
        setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleImg])

  // PDF: Seiten als Vorschau rendern
  useEffect(() => {
    if (!isPdf) return
    let cancelled = false
    ;(async () => {
      try {
        const doc = await openPdf(file)
        docRef.current = doc
        if (cancelled) return
        setNumPages(doc.numPages)
        setSelected([1])
        for (let i = 1; i <= doc.numPages; i++) {
          const r = await renderPage(doc, i, 260)
          if (cancelled) return
          setThumbs((t) => [...t, { no: i, url: r.dataUrl }])
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
      void docRef.current?.loadingTask.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (no: number) =>
    setSelected((s) => (s.includes(no) ? s.filter((x) => x !== no) : [...s, no].sort((a, b) => a - b)))

  const doImport = async () => {
    const doc = docRef.current
    if (!doc || !selected.length) return
    setBusy(true)
    setError(null)
    try {
      const st = useStore.getState()
      const firstFloor = st.activeFloorId
      for (let i = 0; i < selected.length; i++) {
        const no = selected[i]
        const r = await renderPage(doc, no, 4096)
        const fid = i === 0 ? firstFloor : useStore.getState().addFloor()
        useStore.getState().setBackground(fid, r.dataUrl, {
          width: r.width,
          height: r.height,
          mmPerPx: mmPerPxFromScale(r.pxPerPt, denom),
          opacity: 0.7,
          source: `${file.name} · Seite ${no}`,
        })
      }
      const s2 = useStore.getState()
      s2.setActiveFloor(firstFloor)
      s2.setTool('calibrate')
      s2.showToast(
        selected.length > 1
          ? `${selected.length} Geschosse angelegt. Bitte pro Geschoss den Maßstab kalibrieren.`
          : 'Grundriss geladen. Zwei Punkte mit bekanntem Abstand anklicken, um den Maßstab zu prüfen.',
      )
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  if (sheet)
    return (
      <SheetSplit
        onClose={close}
        source={
          isPdf
            ? { fileName: file.name, doc: docRef.current!, page: selected[0] ?? 1 }
            : { fileName: file.name, image: (m) => loadImage(file, m) }
        }
      />
    )

  if (!isPdf && !singleImg) {
    return (
      <Modal title="Bild importieren" width={420} onClose={close}>
        <p className="muted">Zeigt das Bild ein Geschoss oder mehrere Geschosse nebeneinander?</p>
        <div className="btn-row">
          <button className="btn primary" onClick={single}>
            Ein Geschoss
          </button>
          <button className="btn" onClick={() => setSheet(true)}>
            Mehrere Geschosse auf dem Blatt …
          </button>
        </div>
      </Modal>
    )
  }

  if (!isPdf) {
    return (
      <Modal title="Grundriss wird geladen" width={360} onClose={close}>
        <p className="muted center">
          {error ? error : (
            <>
              <Loader2 className="spin" size={18} /> Bild wird verarbeitet …
            </>
          )}
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      title="PDF importieren"
      width={640}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            Abbrechen
          </button>
          <button className="btn" disabled={selected.length !== 1 || busy} onClick={() => setSheet(true)} title="Eine Seite wählen, auf der mehrere Geschosse nebeneinander stehen">
            Mehrere Geschosse auf dieser Seite …
          </button>
          <button className="btn primary" disabled={!selected.length || busy} onClick={doImport}>
            {busy ? 'Importiere …' : selected.length > 1 ? `${selected.length} Seiten als Geschosse importieren` : 'Seite importieren'}
          </button>
        </>
      }
    >
      <p className="muted">
        Wähle die Seite(n) mit den Grundrissen. Die erste Seite geht in das aktuelle Geschoss, jede weitere legt ein neues Geschoss an.
      </p>
      <Row label="Planmaßstab" hint="Papierdruck 1 : x">
        <span className="prefix">1 :</span>
        <NumberField value={denom} decimals={0} min={1} onCommit={setDenom} />
      </Row>
      {error && <p className="warn">{error}</p>}
      <div className="thumbs">
        {thumbs.map((t) => (
          <button key={t.no} className={'thumb' + (selected.includes(t.no) ? ' on' : '')} onClick={() => toggle(t.no)}>
            <img src={t.url} alt={`Seite ${t.no}`} />
            <span>Seite {t.no}</span>
          </button>
        ))}
        {thumbs.length < numPages && (
          <div className="thumb loading">
            <Loader2 className="spin" size={20} />
          </div>
        )}
      </div>
    </Modal>
  )
}
