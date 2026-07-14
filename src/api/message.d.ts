export interface MessageUserInfoResponse {
  data: unknown
}

export function getMessageUserInfo(): Promise<MessageUserInfoResponse>
