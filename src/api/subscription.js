import request from './request'

export function createProCheckout(
  returnTo = '/music',
  paymentMethod = 'wechat_pay',
  contactEmail = '',
  currency = 'CNY',
  billingCycle = 'monthly',
) {
  return request.post('/subscription/pro/checkout', {
    return_to: returnTo,
    payment_method: paymentMethod,
    contact_email: contactEmail,
    currency,
    billing_cycle: billingCycle,
  }).then(response => {
    const orderNo = response.data?.order_no
    const status = response.data?.status
    if (
      typeof orderNo !== 'string'
      || !orderNo.trim()
      || typeof status !== 'string'
      || !status.trim()
    ) {
      throw new Error('Invalid checkout response')
    }
    return { orderNo, status }
  })
}
