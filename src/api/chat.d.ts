export interface ChatApiMember {
  user_id: string;
  avatar?: string | null;
  username: string;
  status: boolean;
}

export interface ChatApiContact {
  user_id?: string | null;
  group_id?: string | null;
  chat_type: 'private' | 'public';
  avatar?: string | null;
  username: string;
  status?: boolean | null;
  content?: string | null;
  last_message_time?: string | null;
  members?: ChatApiMember[];
}

export function getMessageUserInfo(): Promise<ChatApiContact[]>;
