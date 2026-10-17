'use client';

import { useRef, useState, type DragEvent } from 'react';
import { FileUp, Lock, Upload } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';

/**
 * The file step: a large drop target that is also the file picker. The whole
 * zone is the <label> for the file input, so a click or tap anywhere opens
 * the picker, and a dropped file goes to the same onFile as a chosen one.
 *
 * The input is visually hidden rather than display:none, so it is reachable
 * with Tab and the zone shows a focus ring (:focus-within). The old picker
 * button could not be reached from the keyboard at all.
 */
export function DropZone({ onFile }: { onFile: (file: File | undefined) => void }) {
  const { d } = useTranslation();
  const x = d.ux.transactionDialogs;
  const [over, setOver] = useState(false);
  // dragenter/dragleave fire for every child crossed; count them so the
  // highlight does not flicker while the pointer moves over the icon.
  const depth = useRef(0);

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  const onDragEnter = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth.current += 1;
    setOver(true);
  };
  const onDragOver = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = () => {
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(false);
  };
  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    // The wrapper listens too; one drop reads the file once.
    e.stopPropagation();
    depth.current = 0;
    setOver(false);
    onFile(e.dataTransfer.files?.[0]);
  };

  return (
    // A file dropped just beside the zone is caught too, rather than the
    // browser opening it in place of the app.
    <div className="pb-tdlg-file" onDragOver={(e) => { if (hasFiles(e)) e.preventDefault(); }} onDrop={onDrop}>
      <label
        className={`pb-tdlg-drop${over ? ' pb-tdlg-drop-over' : ''}`}
        onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      >
        <span className="pb-tdlg-drop-icon" aria-hidden="true"><FileUp size={26} /></span>
        <span className="pb-tdlg-drop-title">{over ? x.dropRelease : x.dropHere}</span>
        <span className="pb-tdlg-drop-or">{x.orChoose}</span>
        <span className="pill pb-tdlg-drop-btn">
          <Upload size={15} aria-hidden="true" />{d.importCsv.chooseFile}
        </span>
        <input
          type="file" accept=".csv,text/csv,text/plain" className="pb-tdlg-sr" aria-label={d.importCsv.chooseFile}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </label>
      <p className="pb-tdlg-file-hint">
        <Lock size={13} aria-hidden="true" />
        <span>{d.importCsv.chooseHint}</span>
      </p>
    </div>
  );
}
