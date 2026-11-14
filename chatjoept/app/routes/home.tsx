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
  const [quotas, setQuotas] = useState<UserQuotas>({
    usagePercent: 0,
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
    webSearchToSend?: boolean
  ) => {
    const content = (textToSend !== undefined ? textToSend : input).trim();
    const attachments = attachmentsToSend || [];
    const webSearch = webSearchToSend || false;

    if ((!content && attachments.length === 0) || isStreaming || quotas.isSoftLimited) {
      return;
    }

    setInput("");

    // Ensure there is an active session
    let sessionId = activeSessionId;
    let targetSession = sessions.find((s) => s.id === sessionId);

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
      setSessions((prev) => [newSession, ...prev]);
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

    const updatedMessages = [...targetSession.messages, userMessage, assistantMessage];

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

    try {
      const existingDialogBytes = new TextEncoder().encode(
        JSON.stringify([...targetSession.messages, userMessage])
      ).length;

      const formattedChatMessages = [...targetSession.messages, userMessage].map((m) => {
        let fullText = m.content;
        if (m.attachments && m.attachments.length > 0) {
          const filesSummary = m.attachments
            .map((att) => `[File Attachment: ${att.name}]\n\`\`\`\n${att.content}\n\`\`\``)
            .join("\n\n");
          fullText = fullText ? `${fullText}\n\n${filesSummary}` : filesSummary;
        }
        return {
          role: m.role,
          content: fullText,
        };
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
      let streamedText = "";
      let buffer = "";
      let hasStartedReasoning = false;
      let hasClosedReasoning = false;
      let toolsUsed: string[] = [];

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
      let finalDialogToSync: ChatSession | null = null;
      setSessions((currentSessions) => {
        const updated = currentSessions.map((s) => {
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
          const finished = { ...s, messages: msgs, updatedAt: Date.now() };
          finalDialogToSync = finished;
          return finished;
        });
        saveLocalSessions(updated);
        return updated;
      });

      if (finalDialogToSync) {
        await syncDialogToServer(finalDialogToSync, true);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Chat streaming error:", err);
        let errorDialogToSync: ChatSession | null = null;
        setSessions((currentSessions) => {
          const updated = currentSessions.map((s) => {
            if (s.id !== sessionId) return s;
            const msgs = [...s.messages];
            const lastIdx = msgs.length - 1;
            if (lastIdx >= 0 && msgs[lastIdx].role === "assistant") {
              const currentContent = msgs[lastIdx].content;
              msgs[lastIdx] = {
                ...msgs[lastIdx],
                content:
                  currentContent +
                  `\n\n*[ChatJoePT Error]: ${err.message || "Failed to communicate with service"}*`,
              };
            }
            const errorSession = { ...s, messages: msgs };
            errorDialogToSync = errorSession;
            return errorSession;
          });
          saveLocalSessions(updated);
          return updated;
        });

        if (errorDialogToSync) {
          await syncDialogToServer(errorDialogToSync, false);
        }
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

    handleSendMessage(lastUserPrompt, lastAttachments, lastWebSearch);
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
      usagePercent: 0,
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
    <div className="flex h-screen w-screen overflow-hidden bg-[#212121] text-[#ececec]">
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
        <header className="h-14 border-b border-white/5 flex items-center justify-between px-3 md:px-4 z-10 shrink-0 select-none bg-[#212121]/80 backdrop-blur-md">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                type="button"
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
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
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors sm:hidden"
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-gray-300 hover:text-white hover:bg-white/5 border border-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
