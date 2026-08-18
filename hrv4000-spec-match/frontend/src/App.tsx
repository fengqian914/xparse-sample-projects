import { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import PdfViewer from './PdfViewer';
import { API_BASE, extractItems, fetchItems } from './api';
import type { ExtractResult, MatchStatus, RequirementItem } from './types';

const PDF_URL = `${API_BASE}/api/document`;

/** 解释较完整、适合演示的条目置顶，其余按序号 */
const PINNED_IDS = [8, 10, 13, 14, 15, 18, 19, 27, 35, 66];
const MAX_SELECT = 3;

const STATUS_LABEL: Record<MatchStatus, string> = {
  pending: '待抽取',
  matched: '已匹配',
  partial: '部分匹配',
  unmatched: '未匹配',
};

function statusClass(status: MatchStatus) {
  if (status === 'matched') return 'bg-emerald-100 text-emerald-800';
  if (status === 'partial') return 'bg-amber-100 text-amber-800';
  if (status === 'unmatched') return 'bg-slate-200 text-slate-600';
  return 'bg-slate-100 text-slate-500';
}

export default function App() {
  const [items, setItems] = useState<RequirementItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'extract' | null>(null);
  const [hint, setHint] = useState('源文件已前置解析。抽取：翻译 query → 召回 chunk → 模型回填绿色列。');
  const [logs, setLogs] = useState<string[]>([]);
  const [visiblePage, setVisiblePage] = useState(1);
  const [pageTotal, setPageTotal] = useState(0);
  const [jumpToPage, setJumpToPage] = useState<number | null>(null);
  const [jumpNonce, setJumpNonce] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchItems()
      .then(setItems)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filled = items.filter((r) => r.matchStatus === 'matched' || r.matchStatus === 'partial').length;
  const displayItems = useMemo(() => {
    const pin = new Map(PINNED_IDS.map((id, i) => [id, i]));
    return [...items].sort((a, b) => {
      const ia = pin.get(a.id);
      const ib = pin.get(b.id);
      if (ia !== undefined && ib !== undefined) return ia - ib;
      if (ia !== undefined) return -1;
      if (ib !== undefined) return 1;
      return Number(a.seq) - Number(b.seq);
    });
  }, [items]);
  const headerChecked = selected.size > 0;

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setError('');
        return next;
      }
      if (next.size >= MAX_SELECT) {
        setError(`一次最多勾选 ${MAX_SELECT} 行，请先取消部分勾选`);
        return prev;
      }
      setError('');
      next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size > 0) {
      setSelected(new Set());
      setError('');
      return;
    }
    setError(`一次最多勾选 ${MAX_SELECT} 行，请逐条勾选`);
  }

  async function onExtract() {
    if (selected.size === 0) {
      setError('请先勾选要抽取的行');
      return;
    }
    if (selected.size > MAX_SELECT) {
      setError(`一次最多勾选 ${MAX_SELECT} 行`);
      return;
    }
    setBusy('extract');
    setError('');
    setLogs([]);
    try {
      const applyResult = (hit: ExtractResult) => {
        setItems((prev) =>
          prev.map((row) =>
            row.id === hit.id
              ? {
                  ...row,
                  srcChapter: hit.srcChapter,
                  srcDesc: hit.srcDesc,
                  zhChapter: hit.zhChapter,
                  zhDesc: hit.zhDesc,
                  page: hit.page,
                  matchStatus: hit.matchStatus,
                }
              : row,
          ),
        );
      };
      const results = await extractItems(
        [...selected],
        (message) => {
          setLogs((prev) => [...prev, message]);
          setHint(message);
        },
        applyResult,
      );
      results.forEach(applyResult);
      const matched = results.filter((r) => r.matchStatus === 'matched').length;
      const partial = results.filter((r) => r.matchStatus === 'partial').length;
      const unmatched = results.filter((r) => r.matchStatus === 'unmatched').length;
      setHint(`已翻译 → 召回 → 模型回填：已匹配 ${matched}，部分匹配 ${partial}，未匹配 ${unmatched}。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '抽取失败');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full flex-col bg-[#f4f1ea] text-slate-800">
      <header className="shrink-0 border-b border-amber-200/80 bg-[#faf6ee] px-5 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              交付项目需求条目管理 · 匹配回填 Demo
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              左侧基准库 70 行只读；勾选后抽取，回填绿色列（原文章节 / 原文 / 译文章节 / 译文 / 页码）。数字与标准号保持原文。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium shadow-sm">条目 {items.length}</span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 shadow-sm">
              已回填 {filled}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium shadow-sm">
              已选 {selected.size}/{MAX_SELECT}
            </span>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-white">源文件已前置解析</span>
            <button
              type="button"
              onClick={onExtract}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {busy === 'extract' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              抽取所选并回填
            </button>
          </div>
        </div>
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          语料：HRV 4000 PBTS - Conformed 5-22-17（657 页）。右侧为源文件预览；点击已回填行可跳到对应页。
          建议先勾选少量行。流程：英译条目 → 召回标书 → 模型填写章节 / 原文 / 译文 / 页码。
        </div>
        <p className="mt-2 text-xs text-slate-600">{hint}</p>
        {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
        {logs.length > 0 && (
          <pre className="mt-2 max-h-36 overflow-auto rounded-md bg-slate-900 px-3 py-2 font-mono text-[11px] leading-5 text-emerald-100">
            {logs.join('\n')}
          </pre>
        )}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
        <section className="min-h-0 overflow-auto border-r border-slate-200 bg-white">
          {loading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-slate-400">
              <Loader2 className="animate-spin" size={16} /> 加载基准库…
            </div>
          ) : (
            <table className="min-w-[1400px] border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-[#1e3a5f] text-white">
                <tr>
                  <th className="w-8 px-2 py-2">
                    <input type="checkbox" checked={headerChecked} onChange={toggleAll} title={`一次最多 ${MAX_SELECT} 行`} />
                  </th>
                  <th className="px-2 py-2">序号</th>
                  <th className="px-2 py-2">匹配</th>
                  <th className="px-2 py-2">需求类型</th>
                  <th className="px-2 py-2">需求类别</th>
                  <th className="px-2 py-2">功能性质</th>
                  <th className="min-w-[140px] px-2 py-2">需求条目</th>
                  <th className="min-w-[140px] px-2 py-2">解释</th>
                  <th className="min-w-[140px] px-2 py-2">备注/示例</th>
                  <th className="min-w-[160px] bg-emerald-800 px-2 py-2">客户原始章节编号与名称</th>
                  <th className="min-w-[220px] bg-emerald-800 px-2 py-2">客户原始描述</th>
                  <th className="min-w-[160px] bg-emerald-800 px-2 py-2">翻译后章节编号与名称</th>
                  <th className="min-w-[220px] bg-emerald-800 px-2 py-2">翻译后原始需求描述</th>
                  <th className="bg-emerald-800 px-2 py-2">页码</th>
                </tr>
              </thead>
              <tbody>
                {displayItems.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={`align-top ${idx % 2 ? 'bg-slate-50' : 'bg-white'} ${row.page ? 'cursor-pointer hover:bg-sky-50' : ''}`}
                    onClick={() => {
                      if (!row.page) return;
                      setJumpToPage(row.page);
                      setJumpNonce((n) => n + 1);
                    }}
                  >
                    <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                    </td>
                    <td className="px-2 py-1.5 font-medium">{row.seq}</td>
                    <td className="px-2 py-1.5">
                      <span className={`rounded px-1.5 py-0.5 ${statusClass(row.matchStatus)}`}>
                        {STATUS_LABEL[row.matchStatus]}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">{row.reqType}</td>
                    <td className="px-2 py-1.5">{row.category}</td>
                    <td className="px-2 py-1.5">{row.nature}</td>
                    <td className="px-2 py-1.5 font-medium">{row.item}</td>
                    <td className="px-2 py-1.5 text-slate-600">{row.explain}</td>
                    <td className="px-2 py-1.5 text-slate-600">{row.example}</td>
                    <td className="bg-emerald-50/80 px-2 py-1.5">{row.srcChapter}</td>
                    <td className="bg-emerald-50/80 px-2 py-1.5 whitespace-pre-wrap">{row.srcDesc}</td>
                    <td className="bg-emerald-50/80 px-2 py-1.5">{row.zhChapter}</td>
                    <td className="bg-emerald-50/80 px-2 py-1.5 whitespace-pre-wrap">{row.zhDesc}</td>
                    <td className="bg-emerald-50/80 px-2 py-1.5">{row.page ? `p.${row.page}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <aside className="flex min-h-0 flex-col bg-slate-100">
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2 text-xs">
            <span className="font-medium text-slate-700">源文件预览</span>
            <span className="text-slate-500">
              {pageTotal > 0 ? `当前页 ${visiblePage} / ${pageTotal}` : '当前页 —'}
            </span>
          </div>
          <div className="min-h-0 flex-1">
            <PdfViewer
              fileUrl={PDF_URL}
              jumpToPage={jumpToPage}
              jumpNonce={jumpNonce}
              onVisiblePage={(page, total) => {
                setVisiblePage(page);
                setPageTotal(total);
              }}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
