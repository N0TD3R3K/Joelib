export interface Attachment {
  name: string;
  size: number;
  type: string;
  content: string; // text or base64 data
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
}

export interface AuthUser {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  isAuthenticated: boolean;
}

export interface UserQuotas {
  usagePercent: number;
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
