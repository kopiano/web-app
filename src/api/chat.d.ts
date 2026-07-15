export interface ChatApiMember {
  user_id: string;
  avatar?: string | null;
  username: string;
  online: boolean;
}

export interface ChatApiContact {
  user_id?: string | null;
  group_id?: string | null;
  chat_type: 'private' | 'public';
  avatar?: string | null;
  username: string;
  online?: boolean | null;
  content?: string | null;
  last_message_time?: string | null;
  members?: ChatApiMember[];
}

export interface SendMessageInput {
  chat_type: 'private' | 'public';
  receiver_id?: string;
  group_id?: string;
  content: string;
  message_type?: number;
  client_message_id: string;
}

export interface SendImageMessageInput {
  chat_type: 'private' | 'public';
  receiver_id?: string;
  group_id?: string;
  client_message_id: string;
  image: File;
}

export interface ChatApiMessage {
  id: number;
  conversation_id: string;
  chat_type: 'private' | 'public';
  send_id: string;
  client_message_id?: string | null;
  receiver_id?: string | null;
  group_id?: string | null;
  content?: string | null;
  message_type: number;
  status: string;
  created_at: string;
  update_at: string;
  deleted_at?: string | null;
  file_name?: string | null;
  file_url?: string | null;
}

export interface ChatMessageEvent {
  event: 'message';
  message: ChatApiMessage;
}

export interface MessageHistoryQuery {
  chat_type: 'private' | 'public';
  contact_id: string;
  limit?: number;
}

export function getMessageUserInfo(): Promise<ChatApiContact[]>;
export function sendMessage(input: SendMessageInput): Promise<ChatApiMessage>;
export function sendImageMessage(input: SendImageMessageInput): Promise<ChatApiMessage>;
export function getMessageHistory(query: MessageHistoryQuery): Promise<ChatApiMessage[]>;
