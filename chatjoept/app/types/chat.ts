export type AttachmentKind = "image" | "file" | "text";

export interface Attachment {
  name: string;
  size: number;
  type: string;
  kind?: AttachmentKind;
  content: string; // data URL (image), empty/summary (file), or plain text (text)
  fileId?: string;
  parsingPurpose?: "rich_layout_recognition" | "user_data";
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
  attachments?: Attachment[];
  webSearch?: boolean;
  toolsUsed?: string[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  theme: "dark" | "light" | "system";
  temperature?: number;
}

export interface AuthUser {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  isAuthenticated: boolean;
}

export interface UserQuotas {
  usage5hPercent: number;
  usage7dPercent: number;
  uploadedFilesBytes: number;
  uploadedFilesPercent: number;
  chatPercent: number;
  sharePercent: number;
  freePercent: number;
  isSoftLimited: boolean;
  isHardLimited: boolean;
}

export interface SharedLinkSummary {
  shareId: string;
  snapshotDialogId: string;
  sourceDialogId: string | null;
  title: string;
  model: string;
  messageCount: number;
  memoryPercent: number;
  createdAt: number;
}
