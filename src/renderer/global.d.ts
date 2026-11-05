import type { SmsApi } from '../shared/types.js'

declare global {
  interface Window {
    sms?: SmsApi
  }
}

export {}
