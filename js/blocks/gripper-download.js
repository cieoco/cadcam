const DOWNLOAD_HANDOFF_DELAY_MS = 1200;

function filenamePart(value) {
  return String(value).replace(/[^\w.-]/g, '_');
}

// 讓使用者點到的連結本身執行下載；支援會攔截原生連結、但不處理 a.click() 的內嵌瀏覽器。
export function gripperRecordLink(text, width, now = new Date()) {
  const timestamp = now.toISOString().replace(/[-:]/g, '');
  return {
    filename: `gripper-build-record-${filenamePart(width)}mm-${timestamp}.md`,
    href: `data:text/markdown;charset=utf-8,${encodeURIComponent(String(text))}`
  };
}

/** Download a UTF-8 gripper build record, with a distinct filename per width and time. */
export function downloadGripperRecord(text, width, {
  documentRef = globalThis.document,
  urlApi = globalThis.URL,
  setTimeoutFn = globalThis.setTimeout,
  now = () => new Date()
} = {}) {
  const numericWidth = Number(width);
  const widthLabel = filenamePart(Number.isFinite(numericWidth) ? String(numericWidth) : width);
  const date = typeof now === 'function' ? now() : now;
  const timestamp = date.toISOString().replace(/[-:]/g, '');
  const filename = `gripper-build-record-${widthLabel}mm-${timestamp}.md`;
  let anchor = null;
  let objectUrl = null;

  try {
    const blob = new Blob([String(text)], { type: 'text/markdown;charset=utf-8' });
    objectUrl = urlApi.createObjectURL(blob);
    anchor = documentRef.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = 'none';
    documentRef.body.appendChild(anchor);
    anchor.click();
    return filename;
  } finally {
    if (objectUrl) {
      try {
        setTimeoutFn(() => urlApi.revokeObjectURL(objectUrl), DOWNLOAD_HANDOFF_DELAY_MS);
      } catch (_) {
        urlApi.revokeObjectURL(objectUrl);
      }
    }
    if (anchor) {
      if (typeof anchor.remove === 'function') anchor.remove();
      else if (anchor.parentNode) anchor.parentNode.removeChild(anchor);
    }
  }
}
