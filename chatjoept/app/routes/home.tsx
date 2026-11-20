import React, { useState, useEffect, useRef } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { PanelLeft, SquarePen, Share2 } from "lucide-react";
import type {
  ChatSession,
  Message,
  Attachment,
  AuthUser,
  UserQuotas,
} from "~/types/chat";
import { getAuthenticatedUser, getEnv } from "~/utils/auth.server";
import {
  getLocalSessions,
  saveLocalSessions,
  getActiveSessionId,
  setActiveSessionId,
  getLocalSettings,
  saveLocalSettings,
} from "~/utils/storage";
import { AuthGate } from "~/components/AuthGate";
import { Sidebar } from "~/components/Sidebar";
import { ModelSelector } from "~/components/ModelSelector";
import { ChatMessage } from "~/components/ChatMessage";
import { ChatInput } from "~/components/ChatInput";
import { EmptyState } from "~/components/EmptyState";
import { SettingsModal, type SettingsTab } from "~/components/SettingsModal";
import { ShareModal } from "~/components/ShareModal";

export async function loader({ request }: LoaderFunctionArgs) {
  const env = getEnv();
  const session = await getAuthenticatedUser(request, env);
  const url = new URL(request.url);
  const authError = url.searchParams.get("auth_error");

  const user: AuthUser | null = session
    ? {
        sub: session.sub,
        email: session.email,
        name: session.name,
        picture: session.picture,
        isAuthenticated: true,
      }
    : null;

  return {
    isAuthenticated: !!user,
    user,
    authError,
  };
}

export default function Home() {
  const loaderData = useLoaderData<typeof loader>();

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(loaderData.isAuthenticated);
  const [user, setUser] = useState<AuthUser | null>(loaderData.user);

  // App & Chat State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("jpt-6.1-sol");
  const [theme, setTheme] = useState<"dark" | "light" | "system">("system");
  const [temperature, setTemperature] = useState<number>(1.0);
  const [quotas, setQuotas] = useState<UserQuotas>({
    usage5hPercent: 0,
    usage7dPercent: 0,
    uploadedFilesBytes: 0,
    uploadedFilesPercent: 0,
    chatPercent: 0,
    sharePercent: 0,
    freePercent: 100,
    isSoftLimited: false,
    isHardLimited: false,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync a single dialog to the server (D1 storage & credit quotas)
  const syncDialogToServer = async (
    dialog: ChatSession,
    isCompletion = false
  ): Promise<ChatSession | null> => {
    if (!isAuthenticated) return null;
    try {
      const res = await fetch("/api/dialogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dialog, isCompletion }),
      });
      const data: any = await res.json();
      if (data.quotas) {
        setQuotas(data.quotas);
      }
      if (!res.ok) {
        return null;
      }
      if (data.truncated && data.dialog) {
        setSessions((currentSessions) => {
          const updated = currentSessions.map((s) =>
            s.id === data.dialog.id ? data.dialog : s
          );
          saveLocalSessions(updated);
          return updated;
        });
        return data.dialog;
      }
      return data.dialog || dialog;
    } catch (err) {
      console.error("Failed to sync dialog to server:", err);
      return null;
    }
  };

  // Fetch dialogs & quotas from server
  const fetchServerDialogs = async () => {
    try {
      const res = await fetch("/api/dialogs");
      if (!res.ok) return;
      const data: any = await res.json();
      if (data.dialogs && Array.isArray(data.dialogs)) {
        setSessions(data.dialogs);
        saveLocalSessions(data.dialogs);
        const activeId = getActiveSessionId();
        if (data.dialogs.length === 0) {
          setActiveSessionIdState(null);
          setActiveSessionId(null);
        } else if (!activeId || !data.dialogs.some((d: any) => d.id === activeId)) {
          setActiveSessionIdState(data.dialogs[0].id);
          setActiveSessionId(data.dialogs[0].id);
        }
      }
      if (data.quotas) {
        setQuotas(data.quotas);
      }
    } catch (err) {
      console.error("Failed to fetch server dialogs:", err);
    }
  };

  // Load persisted sessions and settings on client mount
  useEffect(() => {
    const loadedSettings = getLocalSettings();
    if (loadedSettings.model) {
      setSelectedModel(loadedSettings.model);
    }
    if (loadedSettings.theme) {
      setTheme(loadedSettings.theme);
    }
    if (
      typeof loadedSettings.temperature === "number" &&
      Number.isFinite(loadedSettings.temperature)
    ) {
      setTemperature(loadedSettings.temperature);
    }

    const loadedSessions = getLocalSessions();
    setSessions(loadedSessions);

    const activeId = getActiveSessionId();
    if (activeId && loadedSessions.some((s) => s.id === activeId)) {
      setActiveSessionIdState(activeId);
    } else if (loadedSessions.length > 0) {
      setActiveSessionIdState(loadedSessions[0].id);
      setActiveSessionId(loadedSessions[0].id);
    }

    if (isAuthenticated) {
      fetchServerDialogs();
    }
  }, [isAuthenticated]);

  // Apply theme class to document root and listen to OS changes in Auto mode
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const useDark = theme === "dark" || (theme === "system" && media.matches);
      root.classList.toggle("dark", useDark);
    };

    applyTheme();

    if (theme === "system") {
      media.addEventListener("change", applyTheme);
      return () => media.removeEventListener("change", applyTheme);
    }
  }, [theme]);

  // Sync sessions changes to localStorage
  const updateSessions = (newSessions: ChatSession[]) => {
    setSessions(newSessions);
    saveLocalSessions(newSessions);
  };

  const currentSession = sessions.find((s) => s.id === activeSessionId) || null;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentSession?.messages, isStreaming]);

  // Create New Chat
  const handleNewChat = () => {
    if (quotas.isSoftLimited) {
      setSettingsTab("account");
      setSettingsOpen(true);
      return;
    }
    if (isStreaming) {
      handleStopStreaming();
    }
    const newSession: ChatSession = {
      id: "chat_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      title: "New chat",
      messages: [],
      model: selectedModel,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const nextSessions = [newSession, ...sessions];
    updateSessions(nextSessions);
    setActiveSessionIdState(newSession.id);
    setActiveSessionId(newSession.id);
    setInput("");
  };

  // Select an existing session
  const handleSelectSession = (id: string) => {
    if (isStreaming) {
      handleStopStreaming();
    }
    setActiveSessionIdState(id);
    setActiveSessionId(id);
  };

  // Delete a session locally and on the server
  const handleDeleteSession = async (id: string) => {
    const nextSessions = sessions.filter((s) => s.id !== id);
    updateSessions(nextSessions);
    if (activeSessionId === id) {
      const nextId = nextSessions.length > 0 ? nextSessions[0].id : null;
      setActiveSessionIdState(nextId);
      setActiveSessionId(nextId);
    }
    if (isAuthenticated) {
      try {
        const res = await fetch(`/api/dialogs?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        const data: any = await res.json();
        if (data.quotas) {
          setQuotas(data.quotas);
        }
      } catch (err) {
        console.error("Failed to delete dialog on server:", err);
      }
    }
  };

  // Clear all chats locally and on the server
  const handleClearAllChats = async () => {
    updateSessions([]);
    setActiveSessionIdState(null);
    setActiveSessionId(null);
    if (isAuthenticated) {
      try {
        const res = await fetch(`/api/dialogs?all=true`, {
          method: "DELETE",
        });
        const data: any = await res.json();
        if (data.quotas) {
          setQuotas(data.quotas);
        }
      } catch (err) {
        console.error("Failed to delete all dialogs on server:", err);
      }
    }
  };

  // Stop active generation
  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  };

  // Send message with optional file attachments and web search
  const handleSendMessage = async (
    textToSend?: string,
    attachmentsToSend?: Attachment[],
    webSearchToSend?: boolean,
    overrideSession?: ChatSession
  ) => {
    const content = (textToSend !== undefined ? textToSend : input).trim();
    const attachments = attachmentsToSend || [];
    const webSearch = webSearchToSend || false;

    if ((!content && attachments.length === 0) || isStreaming || quotas.isSoftLimited) {
      return;
    }

    setInput("");

    // Ensure there is an active session
    let targetSession =
      overrideSession || sessions.find((s) => s.id === activeSessionId);
    let sessionId = targetSession?.id || activeSessionId;

    if (!targetSession) {
      const newSession: ChatSession = {
        id: "chat_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        title: content.slice(0, 36) || (attachments[0]?.name ? `File: ${attachments[0].name}` : "New chat"),
        messages: [],
        model: selectedModel,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      targetSession = newSession;
      sessionId = newSession.id;
      setActiveSessionIdState(sessionId);
      setActiveSessionId(sessionId);
    }

    const userMessage: Message = {
      id: "msg_user_" + Date.now(),
      role: "user",
      content: content || (attachments.length > 0 ? `Attached: ${attachments.map(a => a.name).join(", ")}` : ""),
      createdAt: Date.now(),
      attachments: attachments.length > 0 ? attachments : undefined,
      webSearch,
    };

    const assistantMessage: Message = {
      id: "msg_asst_" + Date.now(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      webSearch,
    };

    const baseMessages = [...targetSession.messages, userMessage];
    const updatedMessages = [...baseMessages, assistantMessage];

    // Auto-title session from first user message
    const updatedTitle =
      targetSession.messages.length === 0
        ? (content || attachments[0]?.name || "New chat").slice(0, 32)
        : targetSession.title;

    const nextSession: ChatSession = {
      ...targetSession,
      title: updatedTitle,
      messages: updatedMessages,
      updatedAt: Date.now(),
    };

    const nextSessions = sessions.some((s) => s.id === sessionId)
      ? sessions.map((s) => (s.id === sessionId ? nextSession : s))
      : [nextSession, ...sessions];

    updateSessions(nextSessions);
    setIsStreaming(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let streamedText = "";
    let hasStartedReasoning = false;
    let hasClosedReasoning = false;
    const toolsUsed: string[] = [];

    const buildFinishedSession = (finalContent: string): ChatSession => ({
      ...nextSession,
      messages: [
        ...baseMessages,
        {
          ...assistantMessage,
          content: finalContent,
          toolsUsed: toolsUsed.length > 0 ? [...toolsUsed] : undefined,
        },
      ],
      updatedAt: Date.now(),
    });

    try {
      const existingDialogBytes = new TextEncoder().encode(
        JSON.stringify(baseMessages)
      ).length;

      const formattedChatMessages = baseMessages.map((m) => {
        if (!m.attachments || m.attachments.length === 0) {
          return { role: m.role, content: m.content };
        }

        const multimodalParts: Array<Record<string, any>> = [];
        const inlineTextAttachments: string[] = [];

        for (const att of m.attachments) {
          const kind =
            att.kind || (att.type.startsWith("image/") ? "image" : "text");
          if (att.fileId && (kind === "file" || kind === "image")) {
            multimodalParts.push({
              type: "file",
              file_id: att.fileId,
            });
          } else if (kind === "image" && att.content.startsWith("data:image/")) {
            multimodalParts.push({
              type: "image_url",
              image_url: { url: att.content },
            });
          } else if (att.content) {
            inlineTextAttachments.push(
              `[File Attachment: ${att.name}]\n\`\`\`\n${att.content}\n\`\`\``
            );
          }
        }

        const combinedText = [m.content, ...inlineTextAttachments]
          .filter(Boolean)
          .join("\n\n");

        if (m.role === "user" && multimodalParts.length > 0) {
          if (combinedText) {
            multimodalParts.push({ type: "text", text: combinedText });
          }
          return { role: m.role, content: multimodalParts };
        }

        return { role: m.role, content: combinedText };
      });

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dialogId: sessionId,
          existingDialogBytes,
          messages: formattedChatMessages,
          webSearch,
          model: selectedModel,
          temperature,
        }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        throw new Error(`Chat error status ${res.status}`);
      }

      if (!res.body) {
        throw new Error("No response body received from server");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const dataStr = trimmed.slice(5).trim();

          if (dataStr === "[DONE]") {
            break;
          }

          try {
            const parsed = JSON.parse(dataStr);

            if (Array.isArray(parsed.chatjoept_tools)) {
              for (const toolName of parsed.chatjoept_tools) {
                if (typeof toolName === "string" && !toolsUsed.includes(toolName)) {
                  toolsUsed.push(toolName);
                }
              }
              setSessions((currentSessions) =>
                currentSessions.map((s) => {
                  if (s.id !== sessionId) return s;
                  const msgs = [...s.messages];
                  const lastIdx = msgs.length - 1;
                  if (lastIdx >= 0 && msgs[lastIdx].role === "assistant") {
                    msgs[lastIdx] = {
                      ...msgs[lastIdx],
                      toolsUsed: toolsUsed.length > 0 ? [...toolsUsed] : undefined,
                    };
                  }
                  return { ...s, messages: msgs, updatedAt: Date.now() };
                })
              );
            }

            const delta = parsed.choices?.[0]?.delta?.content || "";
            const reasoning = parsed.choices?.[0]?.delta?.reasoning_content || "";

            if (reasoning) {
              if (!hasStartedReasoning) {
                streamedText += "<think>";
                hasStartedReasoning = true;
              }
              streamedText += reasoning;
            }

            if (delta) {
              if (hasStartedReasoning && !hasClosedReasoning) {
                streamedText += "</think>\n\n";
                hasClosedReasoning = true;
              }
              streamedText += delta;
            }

            if (delta || reasoning) {
              // Update state with newly arrived chunk
              setSessions((currentSessions) =>
                currentSessions.map((s) => {
                  if (s.id !== sessionId) return s;
                  const msgs = [...s.messages];
                  const lastIdx = msgs.length - 1;
                  if (lastIdx >= 0 && msgs[lastIdx].role === "assistant") {
                    msgs[lastIdx] = {
                      ...msgs[lastIdx],
                      content: streamedText,
                      toolsUsed: toolsUsed.length > 0 ? [...toolsUsed] : undefined,
                    };
                  }
                  return { ...s, messages: msgs, updatedAt: Date.now() };
                })
              );
            }
          } catch {
            // Raw text or incomplete json chunk, wait for next token
          }
        }
      }

      if (hasStartedReasoning && !hasClosedReasoning) {
        streamedText += "</think>\n\n";
      }

      // Final save to localStorage with complete streamed text and sync to D1 server
      const finishedDialog = buildFinishedSession(streamedText);
      setSessions((currentSessions) => {
        const updated = currentSessions.map((s) =>
          s.id === sessionId ? finishedDialog : s
        );
        saveLocalSessions(updated);
        return updated;
      });

      await syncDialogToServer(finishedDialog, true);
    } catch (err: any) {
      if (err.name === "AbortError") {
        // Persist any partial output generated before user stopped
        if (hasStartedReasoning && !hasClosedReasoning) {
          streamedText += "</think>\n\n";
        }
        const abortedDialog = buildFinishedSession(streamedText);
        setSessions((currentSessions) => {
          const updated = currentSessions.map((s) =>
            s.id === sessionId ? abortedDialog : s
          );
          saveLocalSessions(updated);
          return updated;
        });
        await syncDialogToServer(abortedDialog, true);
      } else {
        console.error("Chat streaming error:", err);
        const errorContent =
          streamedText +
          `\n\n*[ChatJoePT Error]: ${err.message || "Failed to communicate with service"}*`;
        const errorDialog = buildFinishedSession(errorContent);
        setSessions((currentSessions) => {
          const updated = currentSessions.map((s) =>
            s.id === sessionId ? errorDialog : s
          );
          saveLocalSessions(updated);
          return updated;
        });

        await syncDialogToServer(errorDialog, false);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  // Regenerate last assistant response
  const handleRegenerate = () => {
    if (!currentSession || isStreaming) return;
    const msgs = currentSession.messages;
    if (msgs.length === 0) return;

    let lastUserPrompt = "";
    let lastAttachments: Attachment[] | undefined;
    let lastWebSearch = false;
    const trimmedMsgs = [...msgs];

    if (trimmedMsgs[trimmedMsgs.length - 1].role === "assistant") {
      trimmedMsgs.pop();
    }
    if (trimmedMsgs.length > 0 && trimmedMsgs[trimmedMsgs.length - 1].role === "user") {
      const u = trimmedMsgs[trimmedMsgs.length - 1];
      lastUserPrompt = u.content;
      lastAttachments = u.attachments;
      lastWebSearch = !!u.webSearch;
      trimmedMsgs.pop();
    }

    if (!lastUserPrompt && (!lastAttachments || lastAttachments.length === 0)) return;

    const nextSession = { ...currentSession, messages: trimmedMsgs };
    const nextSessions = sessions.map((s) => (s.id === currentSession.id ? nextSession : s));
    updateSessions(nextSessions);

    handleSendMessage(lastUserPrompt, lastAttachments, lastWebSearch, nextSession);
  };

  // Handle Logout (clears only ChatJoePT session cookie)
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore network errors on logout
    }
    setIsAuthenticated(false);
    setUser(null);
    updateSessions([]);
    setActiveSessionIdState(null);
    setActiveSessionId(null);
    setQuotas({
      usage5hPercent: 0,
      usage7dPercent: 0,
      uploadedFilesBytes: 0,
      uploadedFilesPercent: 0,
      chatPercent: 0,
      sharePercent: 0,
      freePercent: 100,
      isSoftLimited: false,
      isHardLimited: false,
    });
  };

  // Handle Delete Account (removes ChatJoePT data only; leaves JoeAuth intact)
  const handleDeleteAccount = async () => {
    const res = await fetch("/api/user", { method: "DELETE" });
    if (!res.ok) {
      const errData: any = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to delete ChatJoePT account");
    }
    if (isStreaming) {
      handleStopStreaming();
    }
    try {
      localStorage.clear();
    } catch {
      // Ignore storage errors
    }
    setSettingsOpen(false);
    setShareModalOpen(false);
    setIsAuthenticated(false);
    setUser(null);
    setSessions([]);
    setActiveSessionIdState(null);
    setTheme("system");
    setTemperature(1.0);
    setSelectedModel("jpt-6.1-sol");
    setQuotas({
      usage5hPercent: 0,
      usage7dPercent: 0,
      uploadedFilesBytes: 0,
      uploadedFilesPercent: 0,
      chatPercent: 0,
      sharePercent: 0,
      freePercent: 100,
      isSoftLimited: false,
      isHardLimited: false,
    });
  };

  // If unauthenticated, display the JoeAuth sign-in gate
  if (!isAuthenticated || !user) {
    return <AuthGate authError={loaderData.authError} />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-[#212121] text-gray-900 dark:text-[#ececec] transition-colors duration-200">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        userEmail={user.email}
        userName={user.name}
        userPicture={user.picture}
        isSoftLimited={quotas.isSoftLimited}
        onOpenSettings={() => {
          setSettingsTab("general");
          setSettingsOpen(true);
        }}
        onLogout={handleLogout}
      />

      {/* Main Chat View Area */}
      <main className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Top Navigation Bar */}
        <header className="h-14 border-b border-black/5 dark:border-white/5 flex items-center justify-between px-3 md:px-4 z-10 shrink-0 select-none bg-white/80 dark:bg-[#212121]/80 backdrop-blur-md">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                type="button"
                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                title="Open sidebar"
              >
                <PanelLeft className="w-5 h-5" />
              </button>
            )}

            <ModelSelector
              currentModel={selectedModel}
              onSelectModel={(m) => {
                setSelectedModel(m);
                saveLocalSettings({ model: m });
              }}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleNewChat}
              type="button"
              disabled={quotas.isSoftLimited}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors sm:hidden"
              title={quotas.isSoftLimited ? "Memory full" : "New chat"}
            >
              <SquarePen className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShareModalOpen(true)}
              type="button"
              disabled={
                !currentSession ||
                currentSession.messages.length === 0 ||
                quotas.isSoftLimited
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 border border-black/10 dark:border-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={
                quotas.isSoftLimited
                  ? "Memory full — manage shared links or delete chats in Settings"
                  : "Share conversation snapshot"
              }
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Share</span>
            </button>
          </div>
        </header>

        {/* Conversation Scroll Container */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col">
          {!currentSession || currentSession.messages.length === 0 ? (
            <EmptyState onSelectPrompt={(p) => handleSendMessage(p)} />
          ) : (
            <div className="flex-1 py-4 space-y-2">
              {currentSession.messages.map((msg, index) => {
                const isLast = index === currentSession.messages.length - 1;
                return (
                  <ChatMessage
                    key={msg.id || index}
                    message={msg}
                    isStreaming={isLast && isStreaming}
                    onRegenerate={isLast ? handleRegenerate : undefined}
                  />
                );
              })}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}
        </div>

        {/* Floating Bottom Input Dock with Attachments & Web Search */}
        <ChatInput
          input={input}
          setInput={setInput}
          onSend={(attachedFiles, isWebSearch) =>
            handleSendMessage(undefined, attachedFiles, isWebSearch)
          }
          onStop={handleStopStreaming}
          isStreaming={isStreaming}
          softLimitReached={quotas.isSoftLimited}
          onQuotasUpdated={setQuotas}
        />
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        initialTab={settingsTab}
        onClose={() => setSettingsOpen(false)}
        userEmail={user.email}
        userName={user.name}
        userPicture={user.picture}
        quotas={quotas}
        onQuotasUpdated={setQuotas}
        onClearChats={handleClearAllChats}
        onLogout={handleLogout}
        onDeleteAccount={handleDeleteAccount}
        theme={theme}
        onThemeChange={(nextTheme) => {
          setTheme(nextTheme);
          saveLocalSettings({ theme: nextTheme });
        }}
        temperature={temperature}
        onTemperatureChange={(nextTemp) => {
          setTemperature(nextTemp);
          saveLocalSettings({ temperature: nextTemp });
        }}
      />

      {/* Share Modal */}
      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        dialog={currentSession}
        onQuotasUpdated={setQuotas}
        onOpenManageShares={() => {
          setShareModalOpen(false);
          setSettingsTab("shares");
          setSettingsOpen(true);
        }}
      />
    </div>
  );
}
