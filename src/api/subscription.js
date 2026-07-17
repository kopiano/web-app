import request from './request'

export function createProCheckout(returnTo = '/music') {
  return request.post('/subscription/pro/checkout', {
    return_to: returnTo,
  }).then(response => {
    const checkoutUrl = response.data?.checkout_url
    if (typeof checkoutUrl !== 'string' || !checkoutUrl.trim()) {
      throw new Error('Invalid checkout response')
    }
    return checkoutUrl
  })
}
