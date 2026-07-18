export type ProPaymentMethod = 'wechat_pay' | 'alipay' | 'union_pay';

export function createProCheckout(
  returnTo?: string,
  paymentMethod?: ProPaymentMethod,
  contactEmail?: string,
  currency?: 'CNY' | 'USD',
  billingCycle?: 'monthly' | 'yearly',
): Promise<{ orderNo: string; status: string }>;
