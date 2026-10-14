import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Maximize2, Minimize2, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '@/styles/stocks.scss';

type Frame = '1D' | '5D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y' | 'All';
type Stock = { symbol: string; name: string; sector: string; price: number; change: number; percent: number; color: string; seed: number };

const frames: Frame[] = ['1D', '5D', '1W', '1M', '3M', '6M', '1Y', '5Y', 'All'];
const stocks: Stock[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', price: 237.49, change: 3.42, percent: 1.46, color: '#627e9a', seed: 7 },
  { symbol: 'MSFT', name: 'Microsoft Corp.', sector: 'Technology', price: 425.21, change: 5.87, percent: 1.40, color: '#68a19e', seed: 13 },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', sector: 'Semiconductors', price: 128.72, change: -2.16, percent: -1.65, color: '#84a56e', seed: 29 },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Communication', price: 176.34, change: 1.92, percent: 1.10, color: '#bd9373', seed: 19 },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer', price: 194.66, change: -0.83, percent: -0.42, color: '#bd9a68', seed: 37 },
  { symbol: 'META', name: 'Meta Platforms Inc.', sector: 'Communication', price: 582.18, change: 8.31, percent: 1.45, color: '#7892c1', seed: 43 },
  { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'Automotive', price: 246.38, change: -4.54, percent: -1.81, color: '#be807b', seed: 53 },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'Financials', price: 221.05, change: 1.24, percent: 0.56, color: '#8799a1', seed: 61 },
];
const formatMoney = (value: number) => `$${value.toFixed(2)}`;
const formatChange = (value: number) => `${value >= 0 ? '+' : '-'}$${Math.abs(value).toFixed(2)}`;
const formatChartValue = (value: number) => value.toFixed(2);
const formatReadoutChange = (value: number) => `${value < 0 ? '-' : ''}${Math.abs(value).toFixed(2)}`;
const formatCardChange = (value: number, percent: number) => `${Math.abs(value).toFixed(2)} (${Math.abs(percent).toFixed(2)}%)`;
const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
const logoPath = (symbol: string) => `/stocks/logos/${symbol.toLowerCase()}.webp`;

function CompanyLogo({ stock, className }: { stock: Stock; className: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className={className} style={{ '--company-color': stock.color } as React.CSSProperties} aria-hidden="true">
      {stock.symbol.slice(0, 1)}
    </span>
  ) : (
    <span className={`${className} has-image`} style={{ '--company-color': stock.color } as React.CSSProperties}>
      <img src={logoPath(stock.symbol)} alt={`${stock.name} logo`} onError={() => setFailed(true)} />
    </span>
  );
}
// Illustrative market capitalizations in USD, matching the demo quote dataset.
const marketCaps: Record<string, number> = {
  AAPL: 3.61e12, MSFT: 3.16e12, NVDA: 3.15e12, GOOGL: 2.16e12,
  AMZN: 2.04e12, META: 1.47e12, TSLA: 7.91e11, JPM: 6.22e11,
};
const formatMarketCap = (value: number) => `$${(value / (value >= 1e12 ? 1e12 : 1e9)).toFixed(2)}${value >= 1e12 ? 'T' : 'B'}`;

function seriesFor(stock: Stock, frame: Frame) {
  const frameIndex = frames.indexOf(frame);
  // Keep intraday charts detailed without pushing hundreds of indistinguishable
  // points through the SVG renderer at typical desktop and mobile widths.
  const length = frame === '1D' ? 144 : frame === '5D' ? 120 : 64;
  const range = [0.032, 0.048, 0.056, 0.085, 0.11, 0.14, 0.19, 0.34, 0.48][frameIndex];
  const start = stock.price / (1 + stock.percent / 100 * (frameIndex + 1) * 0.68);
  return Array.from({ length }, (_, index) => {
    const t = index / (length - 1);
    const noise = Math.sin(index * 1.37 + stock.seed) * 0.21
      + Math.sin(index * .47 + stock.seed * 2) * .3
      + Math.sin(index * .17 + frameIndex * 2 + stock.seed) * .32;
    const trend = (stock.price - start) * t;
    return start + trend + stock.price * range * noise * Math.sin(Math.PI * t) * .45;
  });
}

const monthlySeries = stocks.map((stock) => seriesFor(stock, '1M'));

function MonthlySparkline({ values, symbol, negative }: { values: number[]; symbol: string; negative: boolean }) {
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const points = values.map((value, index) => {
    const x = 2 + index / (values.length - 1) * 140;
    const y = 36 - (value - min) / range * 32;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg className={`stocks-sparkline ${negative ? 'is-negative' : 'is-positive'}`} viewBox="0 0 144 40" preserveAspectRatio="none" role="img" aria-label={`${symbol} monthly illustrative price trend`}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function TrendChart({ values, active, onActive, symbol, frame, zh }: {
  values: number[]; active: number | null; onActive: (index: number | null) => void; symbol: string; frame: Frame; zh: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 260 });
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: Math.max(1, entry.contentRect.width), height: Math.max(1, entry.contentRect.height - 24) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const { width, height } = size;
  const pad = { top: 16, right: 64, bottom: 16, left: 8 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const margin = Math.max((max - min) * .18, max * .007);
  const low = min - margin;
  const high = max + margin;
  const point = (value: number, index: number) => ({
    x: pad.left + index / (values.length - 1) * (width - pad.left - pad.right),
    y: pad.top + (high - value) / (high - low) * (height - pad.top - pad.bottom),
  });
  const points = values.map(point);
  const line = points.map(({ x, y }, i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${points[points.length - 1].x} ${height} L${points[0].x} ${height} Z`;
  const selected = active === null ? null : points[active];
  const levels = [0, .25, .5, .75, 1].map((fraction) => ({
    y: pad.top + fraction * (height - pad.top - pad.bottom),
    value: high - fraction * (high - low),
  }));
  const last = points[points.length - 1];
  const days = [1, 5, 7, 30, 90, 180, 365, 1825, 3650][frames.indexOf(frame)];
  const dates = [0, .25, .5, .75, 1].map((fraction) => {
    const date = new Date(Date.UTC(2026, 9, 14, 20) - (1 - fraction) * days * 86400000);
    return new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-US', {
      timeZone: 'UTC',
      ...(frame === '1D' ? { hour: '2-digit', minute: '2-digit' } : days > 365 ? { year: '2-digit', month: 'short' } : { month: 'short', day: 'numeric' }),
    }).format(date);
  });
  return (
    <div className="stocks-chart-wrap" ref={container}>
      <svg
        className="stocks-chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${symbol} illustrative price trend`}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            onActive(Math.max(0, Math.min(values.length - 1, (active ?? values.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1))));
          }
          if (event.key === 'Escape') onActive(null);
        }}
        onBlur={() => onActive(null)}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, ((event.clientX - rect.left) * width / rect.width - pad.left) / (width - pad.left - pad.right)));
          onActive(Math.round(ratio * (values.length - 1)));
        }}
        onPointerLeave={() => onActive(null)}
      >
        <defs>
          <linearGradient id="stock-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--stock-chart-fill)" stopOpacity=".32" />
            <stop offset="100%" stopColor="var(--stock-chart-fill)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {levels.map(({ y, value }) => (
          <g key={y}>
            <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} className="stocks-gridline" />
            <text x={width - pad.right + 12} y={y + 4} className="stocks-axis-label">{formatChartValue(value)}</text>
          </g>
        ))}
        <path d={area} fill="url(#stock-area)" />
        <line x1={pad.left} x2={last.x} y1={last.y} y2={last.y} className="stocks-price-guide" />
        <path d={line} className="stocks-trend-line" />
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="5" className="stocks-chart-endpoint" />
        {selected && (
          <>
            <line x1={selected.x} x2={selected.x} y1={pad.top} y2={height - pad.bottom} className="stocks-crosshair" />
            <line x1={pad.left} x2={width - pad.right} y1={selected.y} y2={selected.y} className="stocks-crosshair" />
            <circle cx={selected.x} cy={selected.y} r="7" className="stocks-chart-dot" />
            <g className="stocks-price-tag">
              <rect x={width - pad.right + 4} y={selected.y - 11} width="59" height="22" rx="4" />
              <text x={width - pad.right + 33.5} y={selected.y + 4} textAnchor="middle">{formatChartValue(values[active!])}</text>
            </g>
          </>
        )}
      </svg>
      <div className="stocks-date-axis" aria-hidden="true">{dates.map((date, index) => <span key={index}>{date}</span>)}</div>
    </div>
  );
}

export default function Stocks() {
  const { i18n } = useTranslation();
  const zh = i18n.language.startsWith('zh');
  const [symbol, setSymbol] = useState('AAPL');
  const [frame, setFrame] = useState<Frame>('1M');
  const [query, setQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [activePoint, setActivePoint] = useState<number | null>(null);
  const [tableCompact, setTableCompact] = useState(false);
  const stock = stocks.find((item) => item.symbol === symbol)!;
  const values = useMemo(() => seriesFor(stock, frame), [stock, frame]);
  const filtered = stocks.filter((item) => `${item.symbol} ${item.name} ${item.sector}`.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => {
    if (!pickerOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setPickerOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPickerOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [pickerOpen]);
  const shownPrice = activePoint === null ? stock.price : values[activePoint];
  const difference = activePoint === null ? stock.change : shownPrice - values[0];
  const percentage = activePoint === null ? stock.percent : (shownPrice / values[0] - 1) * 100;
  const demoEnd = Date.UTC(2026, 9, 14, 20);
  const durationDays = [1, 5, 7, 30, 90, 180, 365, 1825, 3650][frames.indexOf(frame)];
  const selectedDate = new Date(demoEnd - (activePoint === null ? 0 : 1 - activePoint / (values.length - 1)) * durationDays * 86400000);
  const dateLabel = new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
    ...(frame === '1D' ? { hour: '2-digit' as const, minute: '2-digit' as const } : {}),
  }).format(selectedDate);

  const selectStock = (next: string) => {
    setSymbol(next);
    setActivePoint(null);
    setPickerOpen(false);
    setQuery('');
  };

  return (
    <main className="stocks-page">
      <div className={`stocks-shell${tableCompact ? ' is-list-compact' : ''}`}>
        <div className="stocks-quote-grid" role="group" aria-label={zh ? '股票行情' : 'Stock quotes'}>
          {stocks.slice(0, 4).map((item, index) => <button type="button" key={item.symbol} className={`stocks-quote ${symbol === item.symbol ? 'is-selected' : ''}`} onClick={() => selectStock(item.symbol)}>
            <CompanyLogo stock={item} className="stocks-quote-mark" />
            <span className="stocks-quote-details">
              <span className="stocks-quote-symbol">{item.symbol}</span>
              <span className="stocks-quote-name">{item.name}</span>
              <strong>{formatMoney(item.price)}</strong>
              <span className={`stocks-quote-change ${item.change < 0 ? 'is-negative' : 'is-positive'}`}>{formatCardChange(item.change, item.percent)}</span>
            </span>
            <MonthlySparkline values={monthlySeries[index]} symbol={item.symbol} negative={item.percent < 0} />
          </button>)}
        </div>

        <div className="stocks-feature" role="region" aria-label={zh ? '股价走势' : 'Price trend'}>
          <div className="stocks-feature-top">
            <div className="stocks-company">
              <CompanyLogo stock={stock} className="stocks-company-mark" />
              <div><span className="stocks-company-name">{stock.name}</span><span className="stocks-company-meta">{stock.symbol}</span></div>
            </div>
            <div className="stocks-picker" ref={pickerRef}>
              <button type="button" className="stocks-picker-button" onClick={() => setPickerOpen(!pickerOpen)} aria-expanded={pickerOpen} aria-label={zh ? '选择公司' : 'Select company'}>
                <Search size={17} /><span>{stock.symbol}</span><ChevronDown size={16} />
              </button>
              {pickerOpen && <div className="stocks-picker-menu">
                <div className="stocks-picker-search"><Search size={16} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={zh ? '搜索公司或代码' : 'Search company or ticker'} aria-label={zh ? '搜索公司' : 'Search companies'} /><button type="button" onClick={() => setPickerOpen(false)} aria-label={zh ? '关闭' : 'Close'}><X size={15} /></button></div>
                <div className="stocks-picker-options">{filtered.length ? filtered.map((item) => <button key={item.symbol} type="button" className={symbol === item.symbol ? 'is-selected' : ''} onClick={() => selectStock(item.symbol)} aria-current={symbol === item.symbol ? 'true' : undefined}>
                  <CompanyLogo stock={item} className="stocks-picker-mark" />
                  <span className="stocks-picker-identity"><strong>{item.symbol}</strong><small>{item.name}</small></span>
                  <span className="stocks-picker-quote"><strong>{formatMoney(item.price)}</strong><small className={item.percent < 0 ? 'is-negative' : 'is-positive'}>{formatPercent(item.percent)}</small></span>
                  {symbol === item.symbol && <Check className="stocks-picker-check" size={15} aria-hidden="true" />}
                </button>) : <p>{zh ? '未找到公司' : 'No companies found'}</p>}</div>
              </div>}
            </div>
          </div>

          <div className="stocks-chart-row">
            <TrendChart values={values} active={activePoint} onActive={setActivePoint} symbol={symbol} frame={frame} zh={zh} />
            <div className="stocks-price-readout">
              <span className="stocks-readout-label">{activePoint === null ? (zh ? '当前价格' : 'CURRENT PRICE') : (zh ? '选中价格' : 'SELECTED PRICE')}</span>
              <strong>{formatMoney(shownPrice)}</strong>
              <span className={`stocks-readout-change ${difference < 0 ? 'is-negative' : 'is-positive'}`}>{formatReadoutChange(difference)} ({formatReadoutChange(percentage)}%)</span>
              <span className="stocks-readout-date">{dateLabel}</span>
            </div>
          </div>
          <div className="stocks-chart-footer">
            <div className="stocks-timeframes" role="group" aria-label={zh ? '时间范围' : 'Time frame'}>{frames.map((item) => <button type="button" key={item} className={frame === item ? 'is-active' : ''} onClick={() => { setFrame(item); setActivePoint(null); }} aria-pressed={frame === item}>{item}</button>)}</div>
            <span className="stocks-demo-label">{zh ? '演示数据 · 非实时' : 'Demo data · Not live'}</span>
          </div>
        </div>

        <div className="stocks-list" role="region" aria-label={zh ? '公司行情列表' : 'Company quotes'}>
          <div className="stocks-list-heading">
            <h2>{zh ? '公司行情' : 'Companies'}</h2>
            <div className="stocks-list-actions">
              <span>{zh ? '演示数据 · 非实时' : 'Demo data · Not live'}</span>
              <button type="button" className="stocks-list-resize" onClick={() => setTableCompact((current) => !current)} aria-label={tableCompact ? (zh ? '展开表格高度' : 'Expand table height') : (zh ? '缩小表格高度' : 'Reduce table height')} title={tableCompact ? (zh ? '展开表格高度' : 'Expand table height') : (zh ? '缩小表格高度' : 'Reduce table height')} aria-pressed={tableCompact}>
                {tableCompact ? <Maximize2 size={17} /> : <Minimize2 size={17} />}
              </button>
            </div>
          </div>
          <div className="stocks-list-scroll">
            <table className="stocks-list-table">
              <thead>
                <tr>
                  <th scope="col">{zh ? '公司' : 'Company'}</th>
                  <th scope="col">{zh ? '价格' : 'Price'}</th>
                  <th scope="col">{zh ? '涨跌额' : 'Change'}</th>
                  <th scope="col">{zh ? '今日涨跌' : 'Today'}</th>
                  <th scope="col">{zh ? '市值' : 'Market cap'}</th>
                  <th scope="col">{zh ? '近1个月' : '1 month'}</th>
                </tr>
              </thead>
              <tbody>
                {stocks.map((item, index) => (
                  <tr key={item.symbol} className={symbol === item.symbol ? 'is-selected' : ''}>
                    <td>
                      <button type="button" className="stocks-list-company" onClick={() => selectStock(item.symbol)} aria-label={`${zh ? '查看' : 'View'} ${item.name}`}>
                        <CompanyLogo stock={item} className="stocks-list-mark" />
                        <span className="stocks-list-identity"><strong>{item.name}</strong><small>{item.symbol}</small></span>
                      </button>
                    </td>
                    <td className="stocks-list-number">{formatMoney(item.price)}</td>
                    <td className={`stocks-list-number ${item.change < 0 ? 'is-negative' : 'is-positive'}`}>{formatChange(item.change)}</td>
                    <td className={`stocks-list-number ${item.percent < 0 ? 'is-negative' : 'is-positive'}`}>{formatPercent(item.percent)}</td>
                    <td className="stocks-list-number">{formatMarketCap(marketCaps[item.symbol])}</td>
                    <td><MonthlySparkline values={monthlySeries[index]} symbol={item.symbol} negative={item.percent < 0} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
