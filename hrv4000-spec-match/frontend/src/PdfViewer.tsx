import { useCallback, useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { Loader2 } from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const options = {
  cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
};

interface PdfViewerProps {
  fileUrl: string;
  pageNumber: number;
}

export default function PdfViewer({ fileUrl, pageNumber }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>();

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

  useEffect(() => {
    if (pageNumber > 0 && pageRefs.current[pageNumber - 1]) {
      pageRefs.current[pageNumber - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [pageNumber, numPages]);

  return (
    <div ref={containerRef} className="h-full w-full overflow-y-auto bg-slate-200/70">
      <Document
        file={fileUrl}
        onLoadSuccess={({ numPages: n }) => {
          setNumPages(n);
          pageRefs.current = Array(n).fill(null);
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
        {Array.from({ length: numPages || 0 }, (_, index) => {
          const currentPage = index + 1;
          return (
            <div
              key={currentPage}
              ref={(el) => {
                pageRefs.current[index] = el;
              }}
              className="mb-3 flex justify-center"
            >
              <div className="bg-white shadow">
                <Page
                  pageNumber={currentPage}
                  width={containerWidth ? Math.max(containerWidth - 24, 240) : undefined}
                />
              </div>
            </div>
          );
        })}
      </Document>
    </div>
  );
}
