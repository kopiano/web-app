import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ImagePlus, Minus, Plus, ShoppingBag, X } from 'lucide-react';
import request from '@/api/request';
import { resolveAssetUrl } from '@/lib/avatar';
import '@/styles/store.scss';
import '@/styles/store-dark.scss';

type Category = 'all' | 'coffee' | 'tea' | 'bakery';
type Size = 'small' | 'medium' | 'large';
type Temperature = 'iced' | 'hot' | 'room';
type Sweetness = 'standard' | 'less' | 'extra' | 'none';
type Product = {
  id: string;
  name: string;
  zh: string;
  category: Exclude<Category, 'all'>;
  price: number;
  sales: string;
  image: string;
  color: string;
};
type CartItem = {
  key: string;
  productId: string;
  size: Size;
  temperature: Temperature;
  sweetness: Sweetness;
  quantity: number;
};

const photo = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=85`;
const PRODUCTS: Product[] = [
  { id: 'cappuccino', name: 'Cappuccino', zh: '卡布奇诺', category: 'coffee', price: 11.9, sales: '120+', image: photo('photo-1570968915860-54d5c301fa9f'), color: '#e6d4c2' },
  { id: 'latte', name: 'Caffè Latte', zh: '拿铁咖啡', category: 'coffee', price: 13.9, sales: '300+', image: photo('photo-1461023058943-07fcbe16d735'), color: '#d4c3ad' },
  { id: 'americano', name: 'Iced Americano', zh: '冰美式', category: 'coffee', price: 9.9, sales: '200+', image: photo('photo-1517701604599-bb29b565090c'), color: '#c9c4bc' },
  { id: 'mocha', name: 'Chocolate Mocha', zh: '摩卡咖啡', category: 'coffee', price: 15.9, sales: '90+', image: photo('photo-1578314675249-a6910f80cc4e'), color: '#dac5b7' },
  { id: 'matcha', name: 'Matcha Latte', zh: '抹茶拿铁', category: 'tea', price: 16.9, sales: '180+', image: photo('photo-1515823064-d6e0c04616a7'), color: '#d6dec6' },
  { id: 'tea', name: 'Jasmine Tea', zh: '茉莉花茶', category: 'tea', price: 10.9, sales: '110+', image: photo('photo-1544787219-7f47ccb76574'), color: '#dae2cd' },
  { id: 'croissant', name: 'Butter Croissant', zh: '黄油可颂', category: 'bakery', price: 12.9, sales: '150+', image: photo('photo-1555507036-ab1f4038808a'), color: '#ead8bb' },
  { id: 'cheesecake', name: 'Basque Cheesecake', zh: '巴斯克芝士蛋糕', category: 'bakery', price: 19.9, sales: '80+', image: photo('photo-1533134242443-d4fd215305ad'), color: '#e8d9c4' },
];
const CATEGORIES: Category[] = ['all', 'coffee', 'tea', 'bakery'];
const SIZES: Size[] = ['small', 'medium', 'large'];
const TEMPERATURES: Temperature[] = ['iced', 'hot', 'room'];
const SWEETNESS: Sweetness[] = ['standard', 'less', 'extra', 'none'];
const SIZE_EXTRA: Record<Size, number> = { small: 0, medium: 2, large: 4 };
const CART_KEY = 'kopiano_store_cart';
type StoredProduct = { id: string; name: string; category: Product['category']; price: number; sales: number; image_url: string };
const fromStoredProduct = (item: StoredProduct): Product => ({
  id: item.id, name: item.name, zh: item.name, category: item.category,
  price: item.price / 100, sales: String(item.sales),
  image: resolveAssetUrl(item.image_url), color: '#e4e9e2',
});

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the image'));
    reader.readAsDataURL(blob);
  });
}

const copy = {
  en: {
    subtitle: 'Something good, made for your moment.',
    categories: { all: 'All', coffee: 'Coffee', tea: 'Tea', bakery: 'Bakery' },
    popular: 'The menu', sales: 'sold', from: 'From', choose: 'Make it yours',
    size: 'Cup size', temperature: 'Temperature', sweetness: 'Sweetness',
    sizes: { small: 'Small', medium: 'Medium', large: 'Large' },
    temperatures: { iced: 'Iced', hot: 'Hot', room: 'Room temperature' },
    sweetnesses: { standard: 'Standard', less: 'Less sweet', extra: 'Extra sweet', none: 'No sugar' },
    quantity: 'Quantity', add: 'Add to cart', done: 'Ready', cart: 'Your cart',
    empty: 'Your cart is empty.', total: 'Total', added: 'Added to cart',
    close: 'Close', remove: 'Remove item', items: 'items',
    newProduct: 'New product', upload: 'Product photo', uploadHint: 'Any image format · converted to WebP by the server',
    name: 'Product name', namePlaceholder: 'e.g. Cappuccino', category: 'Category',
    productPrice: 'Price (¥)', productSales: 'Sales', saveProduct: 'Add product', publishing: 'Publishing...',
    processing: 'Preparing image...', requiredImage: 'Choose a product photo first.',
    saveFailed: 'Could not save the product. Please try again.',
    loadFailed: 'Products could not be loaded. Refresh to try again.',
  },
  zh: {
    subtitle: '为此刻，做一杯喜欢的。',
    categories: { all: '全部', coffee: '咖啡', tea: '茶饮', bakery: '烘焙' },
    popular: '精选菜单', sales: '已售', from: '起', choose: '定制你的口味',
    size: '杯型', temperature: '温度', sweetness: '甜度',
    sizes: { small: '小杯', medium: '中杯', large: '大杯' },
    temperatures: { iced: '冰', hot: '热', room: '常温' },
    sweetnesses: { standard: '标准甜', less: '少甜', extra: '多甜', none: '无糖' },
    quantity: '数量', add: '加入购物车', done: '选好了', cart: '购物车',
    empty: '购物车还是空的。', total: '合计', added: '已加入购物车',
    close: '关闭', remove: '移除商品', items: '件商品',
    newProduct: '新增商品', upload: '商品图片', uploadHint: '支持任意图片格式 · 后端统一转换为 WebP',
    name: '商品名称', namePlaceholder: '例如：卡布奇诺', category: '分类',
    productPrice: '价格 (¥)', productSales: '销量', saveProduct: '新增商品', publishing: '正在发布中...',
    processing: '正在处理图片...', requiredImage: '请先上传商品图片。',
    saveFailed: '商品保存失败，请重试。',
    loadFailed: '商品加载失败，请刷新页面重试。',
  },
};

function readCart(): CartItem[] {
  try {
    const value = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is CartItem =>
      item && typeof item.key === 'string'
      && SIZES.includes(item.size) && TEMPERATURES.includes(item.temperature)
      && SWEETNESS.includes(item.sweetness)
      && Number.isInteger(item.quantity) && item.quantity > 0);
  } catch {
    return [];
  }
}

export default function Store() {
  const { i18n } = useTranslation();
  const zh = (i18n.resolvedLanguage || i18n.language).startsWith('zh');
  const text = zh ? copy.zh : copy.en;
  const [category, setCategory] = useState<Category>('all');
  const [selected, setSelected] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [dialogClosing, setDialogClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [customProducts, setCustomProducts] = useState<Product[]>([]);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<Exclude<Category, 'all'>>('coffee');
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [newSales, setNewSales] = useState('0');
  const [newImage, setNewImage] = useState('');
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imageBytes, setImageBytes] = useState(0);
  const [imageBusy, setImageBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const [loadError, setLoadError] = useState(false);
  const imageRequestRef = useRef(0);
  const [cart, setCart] = useState<CartItem[]>(readCart);
  const [size, setSize] = useState<Size>('small');
  const [temperature, setTemperature] = useState<Temperature>('iced');
  const [sweetness, setSweetness] = useState<Sweetness>('standard');
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const products = customProducts;
  void PRODUCTS;
  const visible = useMemo(() => products.filter(product => category === 'all' || product.category === category), [category, products]);
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => {
    const product = products.find(entry => entry.id === item.productId);
    return sum + (product ? (product.price + SIZE_EXTRA[item.size]) * item.quantity : 0);
  }, 0);
  const price = selected ? (selected.price + SIZE_EXTRA[size]) * quantity : 0;

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    if (!categoryMenuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      if (!(event.target as Element).closest('.store-category-select')) {
        setCategoryMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, [categoryMenuOpen]);

  useEffect(() => {
    let active = true;
    request.get<StoredProduct[]>('/store/products').then(response => {
      if (active) {
        const payload = Array.isArray(response.data) ? response.data : [];
        setCustomProducts(payload.filter(item =>
          item && typeof item.id === 'string' && typeof item.name === 'string'
          && (item.category === 'coffee' || item.category === 'tea' || item.category === 'bakery')
          && Number.isFinite(item.price) && Number.isFinite(item.sales)
          && typeof item.image_url === 'string'
        ).map(fromStoredProduct));
        const validProductIds = new Set(payload.map(item => item?.id).filter((id): id is string => typeof id === 'string'));
        setCart(current => current.filter(item => validProductIds.has(item.productId)));
        setLoadError(false);
      }
    }).catch(error => {
      console.error('[Store] failed to load products', error);
      if (active) setLoadError(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selected && !cartOpen && !createOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDialog();
      }
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)'));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [selected, cartOpen, createOpen]);

  function closeDialog() {
    if (closeTimerRef.current) return;
    setDialogClosing(true);
    closeTimerRef.current = setTimeout(() => {
      setSelected(null);
      setCartOpen(false);
      setCreateOpen(false);
      setDialogClosing(false);
      closeTimerRef.current = null;
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220);
  }

  function adjustCreateNumber(field: 'price' | 'sales', direction: -1 | 1) {
    if (field === 'price') {
      const current = Number(newPrice) || 0;
      const next = Math.min(99999, Math.max(0.01, Math.round((current + direction * 0.1) * 100) / 100));
      setNewPrice(next.toFixed(2));
      return;
    }
    const current = Number(newSales) || 0;
    const next = Math.min(99999999, Math.max(0, Math.round(current + direction)));
    setNewSales(String(next));
  }

  function openCreate() {
    returnFocusRef.current = document.activeElement as HTMLElement;
    setNewName('');
    setNewCategory('coffee');
    setNewPrice('');
    setNewSales('0');
    setNewImage('');
    setImageBlob(null);
    setImageBytes(0);
    setCreateError('');
    setCreateOpen(true);
  }

  async function selectImage(file?: File) {
    const request = ++imageRequestRef.current;
    if (!file) return;
    setImageBusy(true);
    setCreateError('');
    try {
      const result = file;
      if (request !== imageRequestRef.current) return;
      setNewImage(await blobToDataUrl(result));
      setImageBlob(result);
      setImageBytes(result.size);
    } catch (error) {
      if (request !== imageRequestRef.current) return;
      setNewImage('');
      setImageBlob(null);
      setCreateError(error instanceof Error ? error.message : String(error));
    } finally {
      if (request === imageRequestRef.current) setImageBusy(false);
    }
  }

  async function createProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (imageBusy) return;
    if (!imageBlob) {
      setCreateError(text.requiredImage);
      return;
    }
    const form = new FormData();
    form.set('name', newName.trim());
    form.set('category', newCategory);
    form.set('price', String(Math.round(Number(newPrice) * 100)));
    form.set('sales', newSales);
    form.set('image', imageBlob, imageBlob instanceof File ? imageBlob.name : 'product-image');
    setSaving(true);
    try {
      const response = await request.post<StoredProduct>('/store/products', form);
      setCustomProducts(current => [...current, fromStoredProduct(response.data)]);
      setCategory('all');
      closeDialog();
    } catch {
      setCreateError(text.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  function openProduct(product: Product) {
    returnFocusRef.current = document.activeElement as HTMLElement;
    setSize('small');
    setTemperature(product.category === 'bakery' ? 'room' : 'iced');
    setSweetness('standard');
    setQuantity(1);
    setNotice(false);
    setSelected(product);
  }

  function addToCart() {
    if (!selected) return;
    const key = [selected.id, size, temperature, sweetness].join(':');
    setCart(current => {
      const existing = current.find(item => item.key === key);
      return existing
        ? current.map(item => item.key === key ? { ...item, quantity: item.quantity + quantity } : item)
        : [...current, { key, productId: selected.id, size, temperature, sweetness, quantity }];
    });
    setNotice(true);
  }

  function changeCartQuantity(key: string, delta: number) {
    setCart(current => current.map(item =>
      item.key === key ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item));
  }

  return (
    <main className="store-page">
      <div className="store-shell">
        <header className="store-heading">
          <div>
            <span className="store-eyebrow">KOPIANO / STORE</span>
            <h1>{zh ? '商店' : 'The Store'}</h1>
            <p>{text.subtitle}</p>
          </div>
          <button className="store-cart-trigger" type="button" onClick={() => {
            returnFocusRef.current = document.activeElement as HTMLElement;
            setCartOpen(true);
          }} aria-label={`${text.cart}, ${count} ${text.items}`}>
            <ShoppingBag size={19} strokeWidth={1.8} />
            <span>{text.cart}</span>
            <strong>{count}</strong>
          </button>
        </header>

        <nav className="store-tabs" data-category={category} aria-label={zh ? '商品分类' : 'Product categories'}>
          {CATEGORIES.map(item => (
            <button key={item} type="button" className={category === item ? 'is-active' : ''}
              aria-current={category === item ? 'page' : undefined}
              onClick={() => setCategory(item)}>
              {text.categories[item]}
            </button>
          ))}
        </nav>

        <div className="store-section-line">
          <h2>{category === 'all' ? text.popular : text.categories[category]}</h2>
          <span>{String(visible.length).padStart(2, '0')} / {String(products.length).padStart(2, '0')}</span>
        </div>
        {loadError && <p className="store-create-error" role="alert">{text.loadFailed}</p>}
        <div className="store-grid">
          {visible.map(product => (
            <button className="store-product" key={product.id} type="button"
              onClick={() => openProduct(product)}
              aria-label={`${zh ? product.zh : product.name}, ¥${product.price.toFixed(1)}`}>
              <span className="store-product-image" style={{ backgroundColor: product.color }}>
                <img src={product.image} alt="" loading="lazy" />
              </span>
              <span className="store-product-meta">
                <span className="store-product-name">{zh ? product.zh : product.name}</span>
                <span className="store-product-sales">{text.sales} {product.sales}</span>
              </span>
              <span className="store-product-price"><small>¥</small>{product.price.toFixed(1)}</span>
            </button>
          ))}
        </div>
      </div>

      <button className="store-create-trigger" type="button" onClick={openCreate}
        aria-label={text.newProduct} title={text.newProduct}>
        <Plus size={23} strokeWidth={1.8} />
      </button>

      {(selected || cartOpen || createOpen) && createPortal(
        <div className={`store-overlay${dialogClosing ? ' is-closing' : ''}`} onMouseDown={event => {
          if (event.target === event.currentTarget) {
            closeDialog();
          }
        }}>
          <div className={`store-dialog${cartOpen || createOpen ? ' store-dialog-cart' : ''}`} ref={dialogRef}
            role="dialog" aria-modal="true" aria-label={createOpen ? text.newProduct : cartOpen ? text.cart : (zh ? selected?.zh : selected?.name)}>
            <button className="store-dialog-close" type="button" onClick={closeDialog}
              aria-label={text.close}><X size={20} /></button>
            {createOpen && (
              <form className="store-create-form" onSubmit={createProduct}>
                <span className="store-eyebrow">KOPIANO / STORE</span>
                <h2>{text.newProduct}</h2>
                <label className="store-create-upload">
                  <input type="file" accept="image/*" onChange={event => void selectImage(event.target.files?.[0])} />
                  {newImage ? <img src={newImage} alt="" /> : <ImagePlus size={32} strokeWidth={1.5} />}
                  <span>{imageBusy ? text.processing : newImage ? `${text.upload} · ${Math.round(imageBytes / 1024)} KB` : text.upload}</span>
                  <small>{text.uploadHint}</small>
                </label>
                <label className="store-create-field">{text.name}
                  <input type="text" value={newName} onChange={event => setNewName(event.target.value)}
                    placeholder={text.namePlaceholder} maxLength={80} required />
                </label>
                <div className="store-create-field">
                  <span>{text.category}</span>
                  <div className={`store-category-select${categoryMenuOpen ? ' is-open' : ''}`}>
                    <button className="store-category-trigger" type="button"
                      aria-haspopup="listbox" aria-expanded={categoryMenuOpen}
                      onClick={() => setCategoryMenuOpen(open => !open)}>
                      <span>{text.categories[newCategory]}</span>
                      <ChevronDown size={18} aria-hidden="true" />
                    </button>
                    {categoryMenuOpen && (
                      <div className="store-category-menu" role="listbox" aria-label={text.category}>
                        {CATEGORIES.filter(item => item !== 'all').map(item => (
                          <button type="button" role="option" aria-selected={newCategory === item}
                            className={newCategory === item ? 'is-selected' : ''} key={item}
                            onClick={() => {
                              setNewCategory(item as Exclude<Category, 'all'>);
                              setCategoryMenuOpen(false);
                            }}>
                            {text.categories[item]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="store-create-fields">
                  <div className="store-create-field">
                    <span>{text.productPrice}</span>
                    <div className="store-create-stepper">
                      <button type="button" onClick={() => adjustCreateNumber('price', -1)}
                        disabled={!newPrice || Number(newPrice) <= 0.01} aria-label={`${text.productPrice} -`}>
                        <Minus size={16} />
                      </button>
                      <input type="number" min="0.01" max="99999" step="0.01" inputMode="decimal"
                        value={newPrice} onChange={event => setNewPrice(event.target.value)} required />
                      <button type="button" onClick={() => adjustCreateNumber('price', 1)}
                        disabled={Number(newPrice) >= 99999} aria-label={`${text.productPrice} +`}>
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="store-create-field">
                    <span>{text.productSales}</span>
                    <div className="store-create-stepper">
                      <button type="button" onClick={() => adjustCreateNumber('sales', -1)}
                        disabled={Number(newSales) <= 0} aria-label={`${text.productSales} -`}>
                        <Minus size={16} />
                      </button>
                      <input type="number" min="0" max="99999999" step="1" inputMode="numeric"
                        value={newSales} onChange={event => setNewSales(event.target.value)} required />
                      <button type="button" onClick={() => adjustCreateNumber('sales', 1)}
                        disabled={Number(newSales) >= 99999999} aria-label={`${text.productSales} +`}>
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                </div>
                {createError && <p className="store-create-error" role="alert">{createError}</p>}
                <button className="store-add" type="submit" disabled={imageBusy || saving}>
                  <Plus size={18} />{imageBusy ? text.processing : saving ? text.publishing : text.saveProduct}
                </button>
              </form>
            )}
            {selected && !cartOpen && (
              <>
                <div className="store-dialog-visual" style={{ backgroundColor: selected.color }}>
                  <img src={selected.image} alt="" />
                </div>
                <div className="store-dialog-body">
                  <span className="store-dialog-category">{text.categories[selected.category]}</span>
                  <h2>{zh ? selected.zh : selected.name}</h2>
                  <div className="store-dialog-options">
                    {([
                      [text.size, SIZES, size, setSize, text.sizes],
                      [text.temperature, TEMPERATURES, temperature, setTemperature, text.temperatures],
                      [text.sweetness, SWEETNESS, sweetness, setSweetness, text.sweetnesses],
                    ] as const).map(([label, options, value, setter, labels]) => (
                      <fieldset className="store-options" key={label}>
                        <legend>{label}</legend>
                        <div className="store-option-row">
                          {options.map(option => (
                            <button key={option} type="button" className={value === option ? 'is-selected' : ''}
                              aria-pressed={value === option}
                              onClick={() => (setter as (value: typeof option) => void)(option)}>
                              {labels[option as keyof typeof labels]}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                </div>
                <div className="store-dialog-footer">
                  <div className="store-order-line">
                    <strong>¥{price.toFixed(1)}</strong>
                    <div className="store-quantity">
                      <div className="store-stepper">
                        <button type="button" onClick={() => setQuantity(current => Math.max(1, current - 1))}
                          disabled={quantity <= 1} aria-label="Decrease quantity"><Minus size={16} /></button>
                        <output>{quantity}</output>
                        <button type="button" onClick={() => setQuantity(current => Math.min(99, current + 1))}
                          disabled={quantity >= 99} aria-label="Increase quantity"><Plus size={16} /></button>
                      </div>
                    </div>
                  </div>
                  <div className="store-dialog-actions">
                    <button type="button" className="store-add" onClick={addToCart}>
                      {notice ? text.added : text.add}
                    </button>
                    <button type="button" className="store-done" onClick={closeDialog}>{text.done}</button>
                  </div>
                </div>
              </>
            )}
            {cartOpen && (
              <div className="store-cart-body">
                <span className="store-eyebrow">KOPIANO / STORE</span>
                <h2>{text.cart} <small>{count}</small></h2>
                {cart.length === 0 ? (
                  <p className="store-empty">{text.empty}</p>
                ) : (
                  <div className="store-cart-list">
                    {cart.map(item => {
                      const product = products.find(entry => entry.id === item.productId);
                      if (!product) return null;
                      return (
                        <div className="store-cart-item" key={item.key}>
                          <img src={product.image} alt="" />
                          <div className="store-cart-item-info">
                            <strong>{zh ? product.zh : product.name}</strong>
                            <span>{text.sizes[item.size]} · {text.temperatures[item.temperature]} · {text.sweetnesses[item.sweetness]}</span>
                            <b>¥{((product.price + SIZE_EXTRA[item.size]) * item.quantity).toFixed(1)}</b>
                          </div>
                          <div className="store-cart-item-actions">
                            <button type="button" aria-label={text.remove} onClick={() => setCart(current => current.filter(entry => entry.key !== item.key))}><X size={15} /></button>
                            <div className="store-stepper">
                              <button type="button" disabled={item.quantity <= 1} onClick={() => changeCartQuantity(item.key, -1)} aria-label="Decrease quantity"><Minus size={14} /></button>
                              <output>{item.quantity}</output>
                              <button type="button" disabled={item.quantity >= 99} onClick={() => changeCartQuantity(item.key, 1)} aria-label="Increase quantity"><Plus size={14} /></button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="store-cart-footer"><span>{text.total}</span><strong>¥{total.toFixed(1)}</strong></div>
                <button type="button" className="store-add" onClick={closeDialog}>{text.done}</button>
              </div>
            )}
          </div>
        </div>, document.body,
      )}
    </main>
  );
}
