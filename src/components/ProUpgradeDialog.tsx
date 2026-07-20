import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Check,
  Crown,
  Headphones,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import cnyCurrencyIcon from '@/assets/pay/CNY.svg';
import usdCurrencyIcon from '@/assets/pay/USD.svg';
import wechatPayMonthlyQr from '@/assets/pay/WechatPay_month.webp';
import alipayMonthlyQr from '@/assets/pay/Alipay_month.webp';
import unionPayMonthlyQr from '@/assets/pay/UnionPay_month.webp';
import wechatPayYearlyQr from '@/assets/pay/WechatPay_year.webp';
import alipayYearlyQr from '@/assets/pay/Alipay_year.webp';
import unionPayYearlyQr from '@/assets/pay/UnionPay_year.webp';
import { createProCheckout } from '@/api/subscription';
import '@/styles/music.scss';

type PaymentMethod = 'wechat_pay' | 'alipay' | 'union_pay';
type PaymentCurrency = 'CNY' | 'USD';
type BillingCycle = 'monthly' | 'yearly';
type ProDialogStep = 'intro' | 'payment';

const PAYMENT_QR_IMAGES: Record<BillingCycle, Record<PaymentMethod, string>> = {
  monthly: {
    wechat_pay: wechatPayMonthlyQr,
    alipay: alipayMonthlyQr,
    union_pay: unionPayMonthlyQr,
  },
  yearly: {
    wechat_pay: wechatPayYearlyQr,
    alipay: alipayYearlyQr,
    union_pay: unionPayYearlyQr,
  },
};

type ProUpgradeDialogProps = {
  open: boolean;
  email?: string | null;
  onClose: () => void;
};

export default function ProUpgradeDialog({
  open,
  email,
  onClose,
}: ProUpgradeDialogProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<ProDialogStep>('intro');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wechat_pay');
  const [paymentCurrency, setPaymentCurrency] = useState<PaymentCurrency>('CNY');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [paymentEmail, setPaymentEmail] = useState('');
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [error, setError] = useState('');
  const [isQrPreviewOpen, setIsQrPreviewOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep('intro');
    setPaymentMethod('wechat_pay');
    setPaymentCurrency('CNY');
    setBillingCycle('monthly');
    setPaymentEmail(email?.trim() || '');
    setError('');
    setIsQrPreviewOpen(false);
  }, [email, open]);

  useEffect(() => {
    if (!open || isStartingCheckout) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isQrPreviewOpen) {
        setIsQrPreviewOpen(false);
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isQrPreviewOpen, isStartingCheckout, onClose, open]);

  if (!open) return null;

  const selectedCurrencyPrice = paymentCurrency === 'CNY'
    ? (billingCycle === 'monthly' ? '¥0.10' : '¥1')
    : (billingCycle === 'monthly' ? '$0.0147' : '$0.147');
  const proOriginalPrice = paymentCurrency === 'CNY'
    ? (billingCycle === 'monthly' ? '¥1.00' : '¥10.00')
    : (billingCycle === 'monthly' ? '$0.147' : '$1.47');
  const billingPeriodKey = billingCycle === 'monthly' ? 'music.perMonthShort' : 'music.perYearShort';
  const paymentQrUrl = PAYMENT_QR_IMAGES[billingCycle][paymentMethod];

  const startCheckout = async () => {
    if (isStartingCheckout) return;
    const normalizedEmail = paymentEmail.trim();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError(t('music.invalidPaymentEmail'));
      return;
    }

    setIsStartingCheckout(true);
    setError('');
    try {
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.sessionStorage.setItem('subscription_return_to', returnTo);
      const checkout = await createProCheckout(
        returnTo,
        paymentMethod,
        normalizedEmail,
        paymentCurrency,
        billingCycle,
      );
      window.dispatchEvent(new CustomEvent('app:notification', {
        detail: {
          message: t('music.paymentRequestCreated', { orderNo: checkout.orderNo }),
          type: 'success',
        },
      }));
    } catch (checkoutError: any) {
      const message = checkoutError?.response?.data?.message;
      setError(typeof message === 'string' && message.trim() ? message : t('music.proCheckoutFailed'));
    } finally {
      setIsStartingCheckout(false);
    }
  };

  return (
    <>
      <div className="music-pro-overlay" role="presentation">
        <button
          type="button"
          className="music-pro-backdrop"
          aria-label={t('music.closeProDialog')}
          disabled={isStartingCheckout}
          onClick={onClose}
        />
        <div
          className={`music-pro-dialog${step === 'payment' ? ' is-payment' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="music-pro-title"
          aria-describedby="music-pro-description"
        >
          <button
            type="button"
            className="music-pro-close"
            aria-label={t('music.closeProDialog')}
            disabled={isStartingCheckout}
            onClick={onClose}
          >
            <X size={17} aria-hidden="true" />
          </button>
          <div className="music-pro-step-shell">
            {step === 'intro' ? (
              <div className="music-pro-step music-pro-intro-step">
                <span className="music-pro-crown" aria-hidden="true"><Crown size={25} strokeWidth={1.8} /></span>
                <p className="music-pro-eyebrow">{t('music.proPlan')}</p>
                <h2 id="music-pro-title">{t('music.proUpgradeTitle')}</h2>
                <p id="music-pro-description" className="music-pro-description">{t('music.proUpgradeDescription')}</p>
                <div className="music-pro-benefits">
                  <span><Headphones size={19} aria-hidden="true" />{t('music.proBenefitLibrary')}</span>
                  <span><Sparkles size={19} aria-hidden="true" />{t('music.proBenefitCollections')}</span>
                  <span><ShieldCheck size={19} aria-hidden="true" />{t('music.proBenefitSync')}</span>
                </div>
                <button
                  type="button"
                  className="music-pro-upgrade"
                  onClick={() => {
                    setError('');
                    setStep('payment');
                  }}
                >
                  <Crown size={19} aria-hidden="true" />
                  {t('music.upgradeToPro')}
                </button>
                <small className="music-pro-footnote">{t('music.proReturnNote')}</small>
              </div>
            ) : (
              <div className="music-pro-step music-pro-payment-step">
                <button
                  type="button"
                  className="music-pro-payment-back"
                  aria-label={t('music.backToProOverview')}
                  disabled={isStartingCheckout}
                  onClick={() => {
                    setError('');
                    setStep('intro');
                  }}
                >
                  <ArrowLeft size={18} aria-hidden="true" />
                </button>
                <div className="music-pro-payment-layout">
                  <div className="music-pro-order">
                    <h2 id="music-pro-title">{t('music.subscribeToPro')}</h2>
                    <div className="music-pro-currency" aria-label={t('music.currency')}>
                      {(['CNY', 'USD'] as PaymentCurrency[]).map((currency) => (
                        <button
                          key={currency}
                          type="button"
                          className={paymentCurrency === currency ? 'is-active' : ''}
                          aria-pressed={paymentCurrency === currency}
                          onClick={() => setPaymentCurrency(currency)}
                        >
                          <img className="music-pro-currency-icon" src={currency === 'CNY' ? cnyCurrencyIcon : usdCurrencyIcon} alt="" aria-hidden="true" />
                          <span>{currency}</span>
                          <strong>
                            {currency === 'CNY'
                              ? (billingCycle === 'monthly' ? '¥0.10' : '¥1')
                              : (billingCycle === 'monthly' ? '$0.0147' : '$0.147')}
                            <small>{t(billingPeriodKey)}</small>
                          </strong>
                        </button>
                      ))}
                    </div>
                    <p className="music-pro-exchange-note">{t('music.exchangeRateNote')}</p>
                    <div className={`music-pro-billing-toggle is-${billingCycle}`} aria-label={t('music.billingCycle')}>
                      <span className="music-pro-billing-indicator" aria-hidden="true" />
                      {(['monthly', 'yearly'] as BillingCycle[]).map((cycle) => (
                        <button
                          key={cycle}
                          type="button"
                          className={billingCycle === cycle ? 'is-active' : ''}
                          aria-pressed={billingCycle === cycle}
                          onClick={() => setBillingCycle(cycle)}
                        >
                          <span>{t(`music.${cycle}`)}</span>
                          {cycle === 'yearly' && <em className="music-pro-yearly-offer">2 months free</em>}
                        </button>
                      ))}
                    </div>
                    <div className="music-pro-plan-comparison">
                      <section className="music-pro-plan-card">
                        <h3>{t('music.freePlan')}</h3>
                        <p className="music-pro-plan-price">¥0.00</p>
                        <span className="music-pro-plan-original-price is-placeholder" aria-hidden="true">¥0.00</span>
                        <p className="music-pro-plan-features-label">{t('music.privileges')}</p>
                        <ul>
                          {['chatFeature', 'momentFeature', 'musicListFeature', 'musicFavorityFeature'].map((feature) => (
                            <li key={feature}><Check size={15} aria-hidden="true" />{t(`music.${feature}`)}</li>
                          ))}
                          <li className="is-unavailable"><X size={15} aria-hidden="true" />{t('music.musicLibraryFeature')}</li>
                        </ul>
                      </section>
                      <section className="music-pro-plan-card is-pro">
                        <h3>{t('music.proPlanCard')}</h3>
                        <p className="music-pro-plan-price">{selectedCurrencyPrice}<small>{t(billingPeriodKey)}</small></p>
                        <del className="music-pro-plan-original-price">{proOriginalPrice}</del>
                        <p className="music-pro-plan-features-label">{t('music.privileges')}</p>
                        <ul>
                          {['chatFeature', 'momentFeature', 'musicListFeature', 'musicFavorityFeature', 'musicLibraryFeature'].map((feature) => (
                            <li key={feature}><Check size={15} aria-hidden="true" />{t(`music.${feature}`)}</li>
                          ))}
                        </ul>
                      </section>
                    </div>
                  </div>
                  <div className="music-pro-checkout">
                    <div className={`music-pro-qr is-${paymentMethod}`}>
                      <button
                        type="button"
                        className="music-pro-qr-preview-trigger"
                        aria-label={t('music.viewPaymentQr')}
                        onClick={() => setIsQrPreviewOpen(true)}
                      >
                        <img className="music-pro-qr-image" src={paymentQrUrl} alt={t('music.paymentQrCode')} />
                      </button>
                    </div>
                    <p className="music-pro-qr-caption">{t('music.scanToPay')}</p>
                    <div className="music-pro-field">
                      <span>{t('music.contactInformation')}</span>
                      <label className="music-pro-email-input">
                        <span>{t('music.email')}</span>
                        <input
                          type="email"
                          autoComplete="email"
                          value={paymentEmail}
                          placeholder="you@example.com"
                          disabled={isStartingCheckout}
                          onChange={(event) => setPaymentEmail(event.target.value)}
                        />
                      </label>
                    </div>
                    <fieldset className="music-pro-methods">
                      <legend>{t('music.paymentMethod')}</legend>
                      {(['wechat_pay', 'alipay', 'union_pay'] as PaymentMethod[]).map((method) => (
                        <label key={method} className={`music-pro-method is-${method}`}>
                          <input
                            type="radio"
                            name="music-pro-payment-method"
                            value={method}
                            checked={paymentMethod === method}
                            disabled={isStartingCheckout}
                            onChange={() => setPaymentMethod(method)}
                          />
                          <span className="music-pro-radio" aria-hidden="true" />
                          {method === 'wechat_pay' && <span className="music-pro-brand-mark" aria-hidden="true">W</span>}
                          {method === 'alipay' && <span className="music-pro-brand-mark" aria-hidden="true">A</span>}
                          {method === 'union_pay' && <span className="music-pro-brand-mark" aria-hidden="true">U</span>}
                          <span>{t(`music.${method}`)}</span>
                        </label>
                      ))}
                    </fieldset>
                    {error && <p className="music-pro-error" role="alert">{error}</p>}
                    <button type="button" className="music-pro-pay" disabled={isStartingCheckout} onClick={() => void startCheckout()}>
                      {isStartingCheckout && <LoaderCircle size={19} className="is-spinning" aria-hidden="true" />}
                      {t(isStartingCheckout ? 'music.generatingPaymentQr' : 'music.pay')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {isQrPreviewOpen && (
        <div className="music-pro-qr-preview-overlay" role="dialog" aria-modal="true" aria-label={t('music.paymentQrCode')}>
          <button type="button" className="music-pro-qr-preview-backdrop" aria-label={t('music.closePaymentQrPreview')} onClick={() => setIsQrPreviewOpen(false)} />
          <div className="music-pro-qr-preview-content">
            <img src={paymentQrUrl} alt={t('music.paymentQrCode')} />
            <button type="button" className="music-pro-qr-preview-close" aria-label={t('music.closePaymentQrPreview')} onClick={() => setIsQrPreviewOpen(false)}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
