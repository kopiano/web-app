export interface LlmConfigInput {
  model_name: string;
  api_token: string;
  api_request_url: string;
  effort: string;
}

export interface CreateVoiceTrainingJobInput {
  nickname: string;
  versionName: string;
  audioFiles: File[];
  listFile: File;
  onUploadProgress?: (progress: {
    loaded: number;
    total?: number;
  }) => void;
}

export interface VoiceTrainingJob {
  id: string;
  model_id: string;
  status: 'queued' | 'uploading' | 'training' | 'downloading' | 'ready' | 'failed';
  progress?: number;
  stage?: string;
  error?: string | null;
  artifacts_ready: boolean;
  acknowledged: boolean;
}

export interface VoiceChatInput {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  model_id: string;
  llm: LlmConfigInput;
  language: 'zh' | 'en';
  speed_factor: number;
}

export interface VoiceChatResult {
  text: string;
  audio_url: string;
}

export interface LlmChatInput {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  llm: LlmConfigInput;
  character_id?: string;
  prefer_low_latency?: boolean;
}

export interface LlmChatResult {
  text: string;
}

export interface CharacterSummary {
  id: string;
  name: string;
  avatar_url?: string | null;
  description?: string | null;
  voice_model?: string | null;
  train_status: VoiceTrainingJob['status'] | 'awaiting_training_command' | 'pending';
}

export interface CharacterVoiceModel {
  id: string;
  version: number;
  name: string;
}

export interface CharacterVoiceModelOption extends CharacterVoiceModel {
  status: 'queued' | 'training' | 'ready' | 'awaiting_training_command' | 'failed';
  active: boolean;
}

export interface CharacterDetail {
  id: string;
  name: string;
  voice_model?: CharacterVoiceModel | null;
}

export interface CharacterBinding {
  contact_user_id: string;
  character_id: string;
}

export interface CharacterSession {
  id: string;
  character_id: string;
  created_at: string;
  updated_at: string;
}

export interface CharacterMessageInput {
  session_id: string;
  message: string;
  llm: LlmConfigInput;
  language: 'zh' | 'en';
  speed_factor: number;
}

export interface CharacterMessageResult extends VoiceChatResult {
  session_id: string;
  character_id: string;
}

export interface CharacterTtsInput {
  character_id: string;
  model_id?: string;
  text: string;
  language: 'zh' | 'en';
  speed_factor: number;
}

export interface CreateCharacterInput {
  name: string;
  avatar_url?: string;
  description?: string;
  system_prompt?: string;
  voice_model?: string;
  ckpt_path?: string;
  pth_path?: string;
  train_status?: CharacterSummary['train_status'];
}

export function testLlmConnection(
  llm: LlmConfigInput,
): Promise<{ connected: boolean }>;
export function generateLlmReply(input: LlmChatInput): Promise<LlmChatResult>;
export function streamLlmReply(
  input: LlmChatInput,
  onDelta: (delta: string, text: string) => void,
): Promise<LlmChatResult>;
export function createVoiceTrainingJob(
  input: CreateVoiceTrainingJobInput,
): Promise<VoiceTrainingJob>;
export function getVoiceTrainingJob(jobId: string): Promise<VoiceTrainingJob>;
export function acknowledgeVoiceTrainingJob(jobId: string): Promise<VoiceTrainingJob>;
export function voiceTrainingArtifactsUrl(jobId: string): string;
export function generateVoiceReply(input: VoiceChatInput): Promise<VoiceChatResult>;
export function getCharacters(): Promise<CharacterSummary[]>;
export function getCharacter(characterId: string): Promise<CharacterDetail>;
export function getCharacterModels(
  characterId: string,
): Promise<CharacterVoiceModelOption[]>;
export function switchCharacterModel(
  characterId: string,
  modelId: string,
): Promise<CharacterVoiceModel>;
export function getCharacterBinding(contactUserId: string): Promise<CharacterBinding | null>;
export function saveCharacterBinding(
  contactUserId: string,
  characterId: string | null,
): Promise<CharacterBinding | null>;
export function createCharacterSession(characterId: string): Promise<CharacterSession>;
export function sendCharacterMessage(
  input: CharacterMessageInput,
): Promise<CharacterMessageResult>;
export function generateCharacterTts(
  input: CharacterTtsInput,
): Promise<VoiceChatResult>;
export function characterTtsStreamUrl(input: CharacterTtsInput): string;
export function characterTtsWebSocketUrl(): string;
export interface CharacterTtsStreamSegment {
  index: number;
  text?: string;
  mime_type: string;
  bytes?: number;
  cache?: string;
  elapsed_ms?: number;
  audio_url: string;
}
export interface CharacterTtsStreamResult {
  audio_segments: string[];
  elapsed_ms?: number;
}
export function streamCharacterTts(
  input: CharacterTtsInput,
  callbacks?: {
    onStart?: (event: {
      type: 'start';
      segments: number;
      mime_type: string;
      model_id: string;
    }) => void;
    onSegment?: (segment: CharacterTtsStreamSegment) => void;
    onDone?: (event: {
      type: 'done';
      segments: number;
      elapsed_ms?: number;
    }) => void;
  },
): Promise<CharacterTtsStreamResult>;
export function createCharacter(input: CreateCharacterInput): Promise<CharacterSummary>;
export function deleteCharacter(characterId: string): Promise<{ id: string }>;
