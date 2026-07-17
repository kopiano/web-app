import request from './request'

export function createProCheckout(
  returnTo = '/music',
  paymentMethod = 'wechat_pay',
  contactEmail = '',
  currency = 'CNY',
) {
  return request.post('/subscription/pro/checkout', {
    return_to: returnTo,
    payment_method: paymentMethod,
    contact_email: contactEmail,
    currency,
  }).then(response => {
    const checkoutUrl = response.data?.checkout_url
    if (typeof checkoutUrl !== 'string' || !checkoutUrl.trim()) {
      throw new Error('Invalid checkout response')
    }
    return checkoutUrl
  })
}
