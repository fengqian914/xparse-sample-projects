import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const options = {
  cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
};

/** 从当前页起往后渲几页，前面不预渲，避免跳转后顶上先露出「当前页-2」 */
const AHEAD = 4;

interface PdfViewerProps {
  fileUrl: string;
  jumpToPage?: number | null;
  jumpNonce?: number;
  onVisiblePage?: (page: number, total: number) => void;
}

function clampPage(page: number, total: number) {
  return Math.min(total, Math.max(1, page));
}

export default function PdfViewer({ fileUrl, jumpToPage, jumpNonce, onVisiblePage }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [anchor, setAnchor] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>();
  const onVisiblePageRef = useRef(onVisiblePage);
  onVisiblePageRef.current = onVisiblePage;

  const start = anchor;
  const end = Math.min(numPages || 1, anchor + AHEAD);
  const pages = useMemo(() => {
    const list: number[] = [];
    for (let p = start; p <= end; p += 1) list.push(p);
    return list;
  }, [start, end]);

  const report = useCallback(
    (page: number, total = numPages) => {
      if (!total) return;
      onVisiblePageRef.current?.(clampPage(page, total), total);
    },
    [numPages],
  );

  const onResize = useCallback(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.clientWidth);
    }
  }, []);

  useEffect(() => {
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [onResize]);

  function showPage(page: number) {
    const target = numPages ? clampPage(page, numPages) : Math.max(1, page);
    setAnchor(target);
    report(target);
  }

  useEffect(() => {
    if (!jumpToPage || jumpToPage < 1) return;
    showPage(jumpToPage);
    // showPage 仅作跳转入口
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToPage, jumpNonce, numPages]);

  useLayoutEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [anchor, jumpNonce]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !numPages) return;

    const visible = new Map<number, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page);
          if (!page) continue;
          if (entry.isIntersecting) visible.set(page, entry.intersectionRatio);
          else visible.delete(page);
        }
        if (visible.size === 0) return;
        let best = anchor;
        let ratio = -1;
        for (const [page, r] of visible) {
          if (r > ratio) {
            ratio = r;
            best = page;
          }
        }
        report(best);
      },
      { root, threshold: [0.2, 0.4, 0.6, 0.8] },
    );

    root.querySelectorAll<HTMLElement>('[data-page]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [numPages, pages, anchor, report]);

  return (
    <div className="relative h-full w-full">
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        <button
          type="button"
          onClick={() => showPage(anchor - 1)}
          disabled={!numPages || anchor <= 1}
          className="rounded bg-white/90 p-1 shadow disabled:opacity-40"
          title="上一页"
        >
          <ChevronUp size={14} />
        </button>
        <button
          type="button"
          onClick={() => showPage(anchor + 1)}
          disabled={!numPages || anchor >= numPages}
          className="rounded bg-white/90 p-1 shadow disabled:opacity-40"
          title="下一页"
        >
          <ChevronDown size={14} />
        </button>
      </div>
      <div ref={containerRef} className="h-full w-full overflow-y-auto bg-slate-200/70">
        <Document
          file={fileUrl}
          onLoadSuccess={({ numPages: n }) => {
            setNumPages(n);
            report(anchor, n);
          }}
          options={options}
          loading={
            <div className="flex h-40 items-center justify-center gap-2 text-slate-500">
              <Loader2 className="animate-spin" size={16} />
              加载源文件…
            </div>
          }
          error={<div className="p-6 text-center text-rose-500">无法加载 PDF，请将正式标书放到 frontend/public/hrv4000-pbts.pdf</div>}
        >
          {start > 1 && (
            <button
              type="button"
              onClick={() => showPage(Math.max(1, start - AHEAD))}
              className="mx-auto my-2 block text-center text-[11px] text-slate-500 underline"
            >
              向上加载 p.{Math.max(1, start - AHEAD)}–{start - 1}
            </button>
          )}
          {pages.map((currentPage) => (
            <div key={currentPage} data-page={currentPage} className="mb-3 flex justify-center">
              <div className="bg-white shadow">
                <Page
                  pageNumber={currentPage}
                  width={containerWidth ? Math.max(containerWidth - 24, 240) : undefined}
                />
              </div>
            </div>
          ))}
          {numPages && end < numPages && (
            <button
              type="button"
              onClick={() => showPage(end + 1)}
              className="mx-auto my-2 block text-center text-[11px] text-slate-500 underline"
            >
              向下加载 p.{end + 1}–{Math.min(numPages, end + AHEAD)}
            </button>
          )}
        </Document>
      </div>
    </div>
  );
}
