import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Maximize2, Minimize2, Search, Star, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { authStorage } from '@/lib/auth';
import type { RootState } from '@/store/store';
import '@/styles/stocks.scss';

type Frame = '1D' | '5D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y' | 'All';
type Market = 'CN' | 'HK' | 'US';
type MarketFilter = 'ALL' | Market;
type StockPoint = { timestamp: number; time: string; close: number };
type Stock = { symbol: string; name: string; sector: string; market: Market; price: number; change: number; percent: number; color: string; seed: number; currency?: string; volume?: number; marketCap?: number; points?: StockPoint[]; monthlyPoints?: StockPoint[]; pointsRange?: string };
type StockApiItem = {
  symbol: string;
  name: string;
  market?: string | null;
  currency?: string | null;
  price: number | null;
  change: number | null;
  percent: number | null;
  volume?: number | null;
  market_cap?: number | null;
  points?: StockPoint[];
};

const frames: Frame[] = ['1D', '5D', '1W', '1M', '3M', '6M', '1Y', '5Y', 'All'];
const marketFilters: MarketFilter[] = ['ALL', 'CN', 'HK', 'US'];
const STOCK_REQUEST_TIMEOUT_MS = 12_000;
const FAVORITES_STORAGE_KEY = 'stocks:favorites';
const MARKET_FILTER_STORAGE_KEY = 'stocks:market-filter';
const SHOW_QUOTE_CARDS_STORAGE_KEY = 'stocks:show-quote-cards';
const SELECTED_SYMBOL_STORAGE_KEY = 'stocks:selected-symbol';

const readStoredString = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

const readStoredBoolean = (key: string, fallback: boolean) => {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
};

const readStoredMarketFilter = (): MarketFilter => {
  const value = readStoredString(MARKET_FILTER_STORAGE_KEY, 'ALL');
  return marketFilters.includes(value as MarketFilter) ? value as MarketFilter : 'ALL';
};

const defaultStocks: Stock[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', market: 'US', price: 237.49, change: 3.42, percent: 1.46, volume: 42_860_000, color: '#627e9a', seed: 7, currency: 'USD' },
  { symbol: 'MSFT', name: 'Microsoft Corp.', sector: 'Technology', market: 'US', price: 425.21, change: 5.87, percent: 1.40, volume: 18_420_000, color: '#68a19e', seed: 13, currency: 'USD' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', sector: 'Semiconductors', market: 'US', price: 128.72, change: -2.16, percent: -1.65, volume: 132_750_000, color: '#84a56e', seed: 29, currency: 'USD' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Communication', market: 'US', price: 176.34, change: 1.92, percent: 1.10, volume: 21_360_000, color: '#bd9373', seed: 19, currency: 'USD' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer', market: 'US', price: 194.66, change: -0.83, percent: -0.42, volume: 33_870_000, color: '#bd9a68', seed: 37, currency: 'USD' },
  { symbol: 'META', name: 'Meta Platforms Inc.', sector: 'Communication', market: 'US', price: 582.18, change: 8.31, percent: 1.45, volume: 14_980_000, color: '#7892c1', seed: 43, currency: 'USD' },
  { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'Automotive', market: 'US', price: 246.38, change: -4.54, percent: -1.81, volume: 96_210_000, color: '#be807b', seed: 53, currency: 'USD' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'Financials', market: 'US', price: 221.05, change: 1.24, percent: 0.56, volume: 8_740_000, color: '#8799a1', seed: 61, currency: 'USD' },
];
const toFiniteNumber = (value: unknown, fallback = 0) => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const currencySymbol = (currency?: string) => currency === 'CNY' ? '¥' : '$';
const formatMoney = (value: number | null | undefined, currency?: string) => value == null || !Number.isFinite(value) ? '—' : `${currencySymbol(currency)}${value.toFixed(2)}`;
const formatChange = (value: number | null | undefined, currency?: string) => value == null || !Number.isFinite(value) ? '—' : `${value >= 0 ? '+' : '-'}${currencySymbol(currency)}${Math.abs(value).toFixed(2)}`;
const formatChartValue = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : value.toFixed(2);
const formatReadoutChange = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value < 0 ? '-' : ''}${Math.abs(value).toFixed(2)}`;
const formatCardChange = (value: number | null | undefined, percent: number | null | undefined, currency?: string) => value == null || percent == null || !Number.isFinite(value) || !Number.isFinite(percent) ? '—' : `${currencySymbol(currency)}${Math.abs(value).toFixed(2)} (${Math.abs(percent).toFixed(2)}%)`;
const formatPercent = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
const formatVolume = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value) || value < 0) return '—';
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return Math.round(value).toLocaleString();
};
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
const formatMarketCap = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return `$${(value / (value >= 1e12 ? 1e12 : 1e9)).toFixed(2)}${value >= 1e12 ? 'T' : 'B'}`;
};
const normalizeMarket = (market?: string | null): Market => market === 'CN' || market === 'HK' ? market : 'US';
const stockFromApi = (item: StockApiItem, index: number): Stock => ({
  symbol: item.symbol,
  name: item.name,
  sector: '',
  market: normalizeMarket(item.market),
  price: toFiniteNumber(item.price),
  change: toFiniteNumber(item.change),
  percent: toFiniteNumber(item.percent),
  volume: item.volume == null ? undefined : toFiniteNumber(item.volume),
  marketCap: item.market_cap == null ? undefined : toFiniteNumber(item.market_cap),
  points: normalizePoints(item.points),
  monthlyPoints: normalizePoints(item.points),
  pointsRange: '1mo',
  currency: item.currency ?? 'USD',
  color: defaultStocks[index % defaultStocks.length].color,
  seed: defaultStocks[index % defaultStocks.length].seed,
});

function pointsFor(stock: Stock, frame: Frame) {
  const range = frame === '1D' ? '1d' : frame === '5D' ? '5d' : frame === '1W' || frame === '1M' ? '1mo' : frame === '3M' ? '3mo' : frame === '6M' ? '6mo' : frame === '1Y' ? '1y' : frame === '5Y' ? '5y' : 'max';
  const points = range === '1mo'
    ? stock.monthlyPoints?.length ? stock.monthlyPoints : stock.pointsRange === '1mo' ? stock.points : undefined
    : stock.pointsRange === range ? stock.points : undefined;
  if (!points?.length || frame !== '1W') return points;
  const cutoff = points[points.length - 1].timestamp - 7 * 86_400;
  return points.filter((point) => point.timestamp >= cutoff);
}

function normalizePoints(points?: StockPoint[]) {
  return points?.filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.close)) ?? [];
}

function seriesFor(stock: Stock, frame: Frame) {
  const points = pointsFor(stock, frame);
  if (points?.length) return points.map((point) => point.close);
  const frameIndex = frames.indexOf(frame);
  // Keep intraday charts detailed without pushing hundreds of indistinguishable
  // points through the SVG renderer at typical desktop and mobile widths.
  const length = frame === '1D' ? 144 : frame === '5D' ? 120 : 64;
  const volatility = [0.032, 0.048, 0.056, 0.085, 0.11, 0.14, 0.19, 0.34, 0.48][frameIndex];
  const start = stock.price / (1 + stock.percent / 100 * (frameIndex + 1) * 0.68);
  return Array.from({ length }, (_, index) => {
    const t = index / (length - 1);
    const noise = Math.sin(index * 1.37 + stock.seed) * 0.21
      + Math.sin(index * .47 + stock.seed * 2) * .3
      + Math.sin(index * .17 + frameIndex * 2 + stock.seed) * .32;
    const trend = (stock.price - start) * t;
    return start + trend + stock.price * volatility * noise * Math.sin(Math.PI * t) * .45;
  });
}

function MonthlySparkline({ values, symbol, negative }: { values: number[]; symbol: string; negative: boolean }) {
  if (!values.length) return null;
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const points = values.map((value, index) => {
    const x = 2 + index / (values.length - 1) * 140;
    const y = 36 - (value - min) / range * 32;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg className={`stocks-sparkline ${negative ? 'is-negative' : 'is-positive'}`} viewBox="0 0 144 40" preserveAspectRatio="none" role="img" aria-label={`${symbol} monthly price trend`}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function TrendChart({ values, timestamps, active, onActive, symbol, market, frame, zh }: {
  values: number[]; timestamps?: number[]; active: number | null; onActive: (index: number | null) => void; symbol: string; market: Market; frame: Frame; zh: boolean;
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
  const safeValues = values.length ? values : [0];
  const pad = { top: 16, right: 64, bottom: 16, left: 8 };
  const min = Math.min(...safeValues);
  const max = Math.max(...safeValues);
  const margin = Math.max((max - min) * .18, max * .007);
  const low = min - margin;
  const high = max + margin;
  const point = (value: number, index: number) => ({
    x: pad.left + index / (values.length - 1) * (width - pad.left - pad.right),
    y: pad.top + (high - value) / (high - low) * (height - pad.top - pad.bottom),
  });
  const points = safeValues.map(point);
  const line = points.map(({ x, y }, i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${points[points.length - 1].x} ${height} L${points[0].x} ${height} Z`;
  const activeIndex = active === null ? null : Math.max(0, Math.min(safeValues.length - 1, active));
  const selected = activeIndex === null ? null : points[activeIndex];
  const levels = [0, .25, .5, .75, 1].map((fraction) => ({
    y: pad.top + fraction * (height - pad.top - pad.bottom),
    value: high - fraction * (high - low),
  }));
  const last = points[points.length - 1];
  const days = [1, 5, 7, 30, 90, 180, 365, 1825, 3650][frames.indexOf(frame)];
  const timeZone = market === 'US' ? 'America/New_York' : 'Asia/Shanghai';
  const dateOptions: Intl.DateTimeFormatOptions = frame === '1D' || frame === '5D'
    ? { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : days > 365
      ? { year: 'numeric', month: 'short' }
      : { month: 'short', day: 'numeric' };
  const dates = [0, .25, .5, .75, 1].map((fraction) => {
    const pointIndex = Math.round(fraction * (values.length - 1));
    const timestamp = timestamps?.[pointIndex];
    const date = typeof timestamp === 'number' && Number.isFinite(timestamp)
      ? new Date(timestamp * 1000)
      : new Date(Date.now() - (1 - fraction) * days * 86400000);
    return new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-US', {
      timeZone,
      ...dateOptions,
    }).format(date);
  });
  return (
    <div className="stocks-chart-wrap" ref={container}>
      <svg
        className="stocks-chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${symbol} price trend`}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            onActive(Math.max(0, Math.min(safeValues.length - 1, (activeIndex ?? safeValues.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1))));
          }
          if (event.key === 'Escape') onActive(null);
        }}
        onBlur={() => onActive(null)}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, ((event.clientX - rect.left) * width / rect.width - pad.left) / (width - pad.left - pad.right)));
            onActive(Math.round(ratio * (safeValues.length - 1)));
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
              <text x={width - pad.right + 33.5} y={selected.y + 4} textAnchor="middle">{formatChartValue(safeValues[activeIndex ?? 0])}</text>
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
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const authInitialized = useSelector((state: RootState) => state.auth.initialized);
  const [remoteStocks, setRemoteStocks] = useState<Stock[]>([]);
  const [stocksLoading, setStocksLoading] = useState(false);
  const [stocksError, setStocksError] = useState('');
  // Wait for the auth probe before starting a live quote request. Guests keep
  // the local demo dataset and cannot get stuck behind a stale session hint.
  const isLoggedIn = authInitialized && Boolean(currentUser);
  const stocks = isLoggedIn && remoteStocks.length ? remoteStocks : defaultStocks;
  const [symbol, setSymbol] = useState(() => readStoredString(SELECTED_SYMBOL_STORAGE_KEY, 'AAPL'));
  const [frame, setFrame] = useState<Frame>('1M');
  const [query, setQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [activePoint, setActivePoint] = useState<number | null>(null);
  const [tableCompact, setTableCompact] = useState(false);
  const [showQuoteCards, setShowQuoteCards] = useState(() => readStoredBoolean(SHOW_QUOTE_CARDS_STORAGE_KEY, false));
  const [marketFilter, setMarketFilter] = useState<MarketFilter>(readStoredMarketFilter);
  const [favoriteSymbols, setFavoriteSymbols] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || '[]');
      return new Set(Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string') : []);
    } catch {
      return new Set();
    }
  });
  const stockListCache = useRef<Stock[] | null>(null);
  const trendCache = useRef(new Map<string, StockApiItem>());
  const monthlySeries = useMemo(() => new Map(stocks.map((item) => [item.symbol, seriesFor(item, '1M')])), [stocks]);
  const apiRange = frame === '1D' ? '1d' : frame === '5D' ? '5d' : frame === '1W' || frame === '1M' ? '1mo' : frame === '3M' ? '3mo' : frame === '6M' ? '6mo' : frame === '1Y' ? '1y' : frame === '5Y' ? '5y' : 'max';
  const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:8100/api').replace(/\/$/, '');
  const requestHeaders = () => {
    const token = authStorage.getToken();
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  };
  useEffect(() => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...favoriteSymbols]));
  }, [favoriteSymbols]);
  useEffect(() => {
    localStorage.setItem(MARKET_FILTER_STORAGE_KEY, marketFilter);
  }, [marketFilter]);
  useEffect(() => {
    localStorage.setItem(SHOW_QUOTE_CARDS_STORAGE_KEY, String(showQuoteCards));
  }, [showQuoteCards]);
  useEffect(() => {
    if (!authInitialized || (isLoggedIn && !remoteStocks.length)) return;
    localStorage.setItem(SELECTED_SYMBOL_STORAGE_KEY, symbol);
  }, [authInitialized, isLoggedIn, remoteStocks.length, symbol]);
  useEffect(() => {
    if (!isLoggedIn) {
      setRemoteStocks([]);
      setStocksLoading(false);
      setStocksError('');
      return;
    }
    let cancelled = false;
    setStocksLoading(true);
    setStocksError('');
    if (stockListCache.current) {
      setRemoteStocks(stockListCache.current);
      setStocksLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), STOCK_REQUEST_TIMEOUT_MS);
    fetch(`${apiBase}/stocks?range=1mo&interval=1d`, {
      credentials: 'include',
      headers: requestHeaders(),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load stock data');
        return response.json();
      })
      .then((items: StockApiItem[]) => {
        if (cancelled) return;
        const liveItems = items.filter((item) => item.price != null && Number.isFinite(Number(item.price)));
        if (!liveItems.length) throw new Error('No stock data returned');
        const nextStocks = liveItems.map(stockFromApi);
        stockListCache.current = nextStocks;
        setRemoteStocks(nextStocks);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStocksError(error instanceof DOMException && error.name === 'AbortError'
          ? 'Stock data request timed out'
          : error instanceof Error ? error.message : 'Unable to load stock data');
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (!cancelled) setStocksLoading(false);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [apiBase, isLoggedIn]);
  useEffect(() => {
    if (!isLoggedIn || apiRange === '1mo' || !remoteStocks.some((item) => item.symbol === symbol)) return;
    let cancelled = false;
    const controller = new AbortController();
    const cacheKey = `${symbol}:${apiRange}`;
    const cachedItem = trendCache.current.get(cacheKey);
    if (cachedItem) {
      setRemoteStocks((current) => current.map((item) => item.symbol === cachedItem.symbol
        ? {
          ...item,
          price: toFiniteNumber(cachedItem.price, item.price),
          change: toFiniteNumber(cachedItem.change),
          percent: toFiniteNumber(cachedItem.percent),
          volume: cachedItem.volume == null ? item.volume : toFiniteNumber(cachedItem.volume),
          marketCap: cachedItem.market_cap == null ? item.marketCap : toFiniteNumber(cachedItem.market_cap),
          points: normalizePoints(cachedItem.points),
          pointsRange: apiRange,
        }
        : item));
      return;
    }
    setStocksLoading(true);
    const encodedSymbol = encodeURIComponent(symbol);
    const timeoutId = window.setTimeout(() => controller.abort(), STOCK_REQUEST_TIMEOUT_MS);
    fetch(`${apiBase}/stocks/${encodedSymbol}?range=${apiRange}`, {
      credentials: 'include',
      headers: requestHeaders(),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load stock trend');
        return response.json();
      })
      .then((item: StockApiItem) => {
        if (cancelled || item.price == null || !Number.isFinite(Number(item.price))) return;
        trendCache.current.set(cacheKey, item);
        setRemoteStocks((current) => current.map((stock) => stock.symbol === item.symbol
          ? {
            ...stock,
            name: item.name,
            market: normalizeMarket(item.market),
            price: toFiniteNumber(item.price, stock.price),
            change: toFiniteNumber(item.change),
            percent: toFiniteNumber(item.percent),
            volume: item.volume == null ? stock.volume : toFiniteNumber(item.volume),
            marketCap: item.market_cap == null ? stock.marketCap : toFiniteNumber(item.market_cap),
            currency: item.currency ?? stock.currency,
            points: normalizePoints(item.points),
            pointsRange: apiRange,
          }
          : stock));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStocksError(error instanceof DOMException && error.name === 'AbortError'
            ? 'Stock trend request timed out'
            : error instanceof Error ? error.message : 'Unable to load stock trend');
        }
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (!cancelled) setStocksLoading(false);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [apiBase, apiRange, isLoggedIn, remoteStocks.length, symbol]);
  const stock = stocks.find((item) => item.symbol === symbol) ?? stocks[0];
  const chartPoints = useMemo(() => stock ? pointsFor(stock, frame) : undefined, [stock, frame]);
  const values = useMemo(() => {
    if (chartPoints?.length) return chartPoints.map((point) => point.close);
    return stock ? seriesFor(stock, frame) : [];
  }, [chartPoints, stock, frame]);
  const filtered = stocks.filter((item) => `${item.symbol} ${item.name} ${item.sector}`.toLowerCase().includes(query.trim().toLowerCase()));
  const tableStocks = marketFilter === 'ALL' ? stocks : stocks.filter((item) => item.market === marketFilter);
  const favoriteStocks = stocks.filter((item) => favoriteSymbols.has(item.symbol)).slice(0, 4);
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
  useEffect(() => {
    if (isLoggedIn && !remoteStocks.length) return;
    if (stocks.length && !stocks.some((item) => item.symbol === symbol)) {
      setSymbol(stocks[0].symbol);
      setActivePoint(null);
    }
  }, [isLoggedIn, remoteStocks.length, stocks, symbol]);
  if (!stock) {
    const loading = !authInitialized || stocksLoading;
    return <main className="stocks-page"><div className={`stocks-state${stocksError ? ' is-error' : ''}`}>{loading ? (zh ? '正在加载股票数据…' : 'Loading stock data…') : stocksError || (zh ? '暂无股票数据' : 'No stock data available')}</div></main>;
  }
  const activeIndex = activePoint === null || !values.length
    ? null
    : Math.max(0, Math.min(values.length - 1, activePoint));
  const shownPrice = activeIndex === null ? stock.price : values[activeIndex] ?? stock.price;
  const firstValue = values[0] ?? stock.price;
  const difference = activeIndex === null ? stock.change : shownPrice - firstValue;
  const percentage = activeIndex === null ? stock.percent : firstValue ? (shownPrice / firstValue - 1) * 100 : 0;
  const demoEnd = Date.now();
  const durationDays = [1, 5, 7, 30, 90, 180, 365, 1825, 3650][frames.indexOf(frame)];
  const selectedPoint = activeIndex === null
    ? chartPoints?.[chartPoints.length - 1]
    : chartPoints?.[activeIndex ?? 0];
  const selectedDate = selectedPoint
    ? new Date(selectedPoint.timestamp * 1000)
    : new Date(demoEnd - (activeIndex === null ? 0 : 1 - activeIndex / Math.max(1, values.length - 1)) * durationDays * 86400000);
  const dateLabel = new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    timeZone: stock.market === 'US' ? 'America/New_York' : 'Asia/Shanghai',
    ...(frame === '1D' || frame === '5D' ? { hour: '2-digit' as const, minute: '2-digit' as const } : {}),
  }).format(selectedDate);

  const selectStock = (next: string) => {
    setSymbol(next);
    setActivePoint(null);
    setPickerOpen(false);
    setQuery('');
  };
  const toggleFavorite = (next: string) => {
    setFavoriteSymbols((current) => {
      const updated = new Set(current);
      if (updated.has(next)) updated.delete(next);
      else {
        updated.add(next);
        setShowQuoteCards(true);
      }
      if (updated.size === 0) setShowQuoteCards(false);
      return updated;
    });
  };
  const quoteCards = showQuoteCards ? (favoriteStocks.length ? favoriteStocks : stocks.slice(0, 4)) : [];

  return (
    <main className="stocks-page">
      <div className={`stocks-shell${tableCompact ? ' is-list-compact' : ''}${quoteCards.length ? '' : ' is-quotes-hidden'}`}>
        {quoteCards.length > 0 && <div className="stocks-quote-grid" role="group" aria-label={zh ? '收藏股票行情' : 'Favorite stock quotes'}>
          {quoteCards.map((item) => <button type="button" key={item.symbol} className={`stocks-quote ${symbol === item.symbol ? 'is-selected' : ''}`} onClick={() => selectStock(item.symbol)}>
            <CompanyLogo stock={item} className="stocks-quote-mark" />
            <span className="stocks-quote-details">
              <span className="stocks-quote-symbol">{item.symbol}</span>
              <span className="stocks-quote-name">{item.name}</span>
              <strong>{formatMoney(item.price, item.currency)}</strong>
              <span className={`stocks-quote-change ${item.change < 0 ? 'is-negative' : 'is-positive'}`}>{formatCardChange(item.change, item.percent, item.currency)}</span>
            </span>
            <MonthlySparkline values={monthlySeries.get(item.symbol) ?? []} symbol={item.symbol} negative={item.percent < 0} />
          </button>)}
        </div>}

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
                  <span className="stocks-picker-quote"><strong>{formatMoney(item.price, item.currency)}</strong><small className={item.percent < 0 ? 'is-negative' : 'is-positive'}>{formatPercent(item.percent)}</small></span>
                  {symbol === item.symbol && <Check className="stocks-picker-check" size={15} aria-hidden="true" />}
                </button>) : <p>{zh ? '未找到公司' : 'No companies found'}</p>}</div>
              </div>}
            </div>
          </div>

          <div className="stocks-chart-row">
            <TrendChart values={values} timestamps={chartPoints?.map((point) => point.timestamp)} active={activeIndex} onActive={setActivePoint} symbol={symbol} market={stock.market} frame={frame} zh={zh} />
            <div className="stocks-price-readout">
              <span className="stocks-readout-label">{activePoint === null ? (zh ? '当前价格' : 'CURRENT PRICE') : (zh ? '选中价格' : 'SELECTED PRICE')}</span>
              <strong>{formatMoney(shownPrice, stock.currency)}</strong>
              <span className={`stocks-readout-change ${difference < 0 ? 'is-negative' : 'is-positive'}`}>{formatReadoutChange(difference)} ({formatReadoutChange(percentage)}%)</span>
              <span className="stocks-readout-date">{dateLabel}</span>
            </div>
          </div>
          <div className="stocks-chart-footer">
            <div className="stocks-timeframes" role="group" aria-label={zh ? '时间范围' : 'Time frame'}>{frames.map((item) => <button type="button" key={item} className={frame === item ? 'is-active' : ''} onClick={() => { setFrame(item); setActivePoint(null); }} aria-pressed={frame === item}>{item}</button>)}</div>
          </div>
        </div>

        <div className="stocks-list" role="region" aria-label={zh ? '公司行情列表' : 'Company quotes'}>
          <div className="stocks-list-heading">
            <h2>{zh ? '公司行情' : 'Stock Comparison'}</h2>
            <div className="stocks-list-actions">
              <div className="stocks-market-filter" role="group" aria-label={zh ? '按市场筛选' : 'Filter by market'}>
                {marketFilters.map((market) => (
                  <button
                    type="button"
                    key={market}
                    className={`stocks-market-filter-button market-${market.toLowerCase()}${marketFilter === market ? ' is-active' : ''}`}
                    onClick={() => setMarketFilter(market)}
                    aria-pressed={marketFilter === market}
                  >
                    {market === 'ALL' ? (zh ? '全部' : 'All') : market}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={`stocks-cards-toggle${showQuoteCards ? ' is-on' : ''}`}
                onClick={() => setShowQuoteCards((current) => !current)}
                role="switch"
                aria-checked={showQuoteCards}
                aria-label={showQuoteCards ? (zh ? '隐藏股票小卡片' : 'Hide stock cards') : (zh ? '显示股票小卡片' : 'Show stock cards')}
                title={showQuoteCards ? (zh ? '隐藏股票小卡片' : 'Hide stock cards') : (zh ? '显示股票小卡片' : 'Show stock cards')}
              >
                <span className="stocks-cards-toggle-track" aria-hidden="true">
                  <span className="stocks-cards-toggle-thumb" />
                </span>
                <span className="stocks-cards-toggle-label">{showQuoteCards ? (zh ? '卡片' : 'Cards') : (zh ? '关闭' : 'Off')}</span>
              </button>
              <button type="button" className="stocks-list-resize" onClick={() => setTableCompact((current) => !current)} aria-label={tableCompact ? (zh ? '展开表格高度' : 'Expand table height') : (zh ? '缩小表格高度' : 'Reduce table height')} title={tableCompact ? (zh ? '展开表格高度' : 'Expand table height') : (zh ? '缩小表格高度' : 'Reduce table height')} aria-pressed={tableCompact}>
                {tableCompact ? <Maximize2 size={17} /> : <Minimize2 size={17} />}
              </button>
            </div>
          </div>
          <div className="stocks-list-scroll">
            <table className="stocks-list-table">
              <colgroup>
                <col className="stocks-list-column-company" />
                <col className="stocks-list-column-market" />
                <col className="stocks-list-column-price" />
                <col className="stocks-list-column-change" />
                <col className="stocks-list-column-percent" />
                <col className="stocks-list-column-volume" />
                <col className="stocks-list-column-trend" />
                <col className="stocks-list-column-favorite" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">{zh ? '公司' : 'Company'}</th>
                  <th scope="col">{zh ? '市场' : 'Market'}</th>
                  <th scope="col">{zh ? '价格' : 'Price'}</th>
                  <th scope="col">{zh ? '涨跌额' : 'CHG'}</th>
                  <th scope="col">{zh ? '今日涨跌' : 'CHG %'}</th>
                  <th scope="col">{zh ? '成交量' : 'VOL'}</th>
                  <th scope="col">{zh ? '近1个月' : '1 Month'}</th>
                  <th scope="col"><Star size={15} aria-label={zh ? '收藏' : 'Favorite'} /></th>
                </tr>
              </thead>
              <tbody key={marketFilter} className="stocks-table-body">
                {tableStocks.map((item) => (
                  <tr key={item.symbol} className={symbol === item.symbol ? 'is-selected' : ''}>
                    <td>
                      <button type="button" className="stocks-list-company" onClick={() => selectStock(item.symbol)} aria-label={`${zh ? '查看' : 'View'} ${item.name}`}>
                        <CompanyLogo stock={item} className="stocks-list-mark" />
                        <span className="stocks-list-identity"><strong>{item.name}</strong><small>{item.symbol}</small></span>
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`stocks-market-badge market-${item.market.toLowerCase()}`}
                        onClick={() => setMarketFilter(item.market)}
                        aria-label={`${zh ? '按市场筛选' : 'Filter by market'} ${item.market}`}
                        aria-pressed={marketFilter === item.market}
                      >
                        {item.market}
                      </button>
                    </td>
                    <td className="stocks-list-number">{formatMoney(item.price, item.currency)}</td>
                    <td className={`stocks-list-number ${item.change < 0 ? 'is-negative' : 'is-positive'}`}>{formatChange(item.change, item.currency)}</td>
                    <td className={`stocks-list-number ${item.percent < 0 ? 'is-negative' : 'is-positive'}`}>{formatPercent(item.percent)}</td>
                    <td
                      className="stocks-list-number"
                      title={`${zh ? '市值' : 'Market cap'}: ${formatMarketCap(item.marketCap ?? marketCaps[item.symbol] ?? 0)}`}
                    >
                      {formatVolume(item.volume)}
                    </td>
                    <td><MonthlySparkline values={monthlySeries.get(item.symbol) ?? []} symbol={item.symbol} negative={item.percent < 0} /></td>
                    <td className="stocks-list-favorite-cell">
                      <button
                        type="button"
                        className={`stocks-list-favorite${favoriteSymbols.has(item.symbol) ? ' is-active' : ''}`}
                        onClick={() => toggleFavorite(item.symbol)}
                        aria-label={favoriteSymbols.has(item.symbol)
                          ? `${zh ? '取消收藏' : 'Remove from favorites'} ${item.name}`
                          : `${zh ? '收藏' : 'Add to favorites'} ${item.name}`}
                        aria-pressed={favoriteSymbols.has(item.symbol)}
                        title={favoriteSymbols.has(item.symbol)
                          ? (zh ? '取消收藏' : 'Remove from favorites')
                          : (zh ? '收藏' : 'Add to favorites')}
                      >
                        <Star size={17} fill={favoriteSymbols.has(item.symbol) ? 'currentColor' : 'none'} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!tableStocks.length && (
                  <tr>
                    <td colSpan={8} className="stocks-list-empty">{zh ? '该市场暂无股票数据' : 'No stocks in this market'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
