type ConversationToolEventObserver = (detail: Record<string, unknown>) => void;

const conversationToolEventObservers = new Map<string, Set<ConversationToolEventObserver>>();

export function registerConversationToolEventObserver(
  conversationId: string,
  observer: ConversationToolEventObserver,
): () => void {
  const normalizedConversationId = conversationId.trim();
  if (!normalizedConversationId) {
    return () => {};
  }

  const observers = conversationToolEventObservers.get(normalizedConversationId) ?? new Set<ConversationToolEventObserver>();
  observers.add(observer);
  conversationToolEventObservers.set(normalizedConversationId, observers);

  return () => {
    const current = conversationToolEventObservers.get(normalizedConversationId);
    if (!current) {
      return;
    }
    current.delete(observer);
    if (current.size === 0) {
      conversationToolEventObservers.delete(normalizedConversationId);
    }
  };
}

export function notifyConversationToolEvent(
  conversationId: string | undefined,
  detail: Record<string, unknown>,
): void {
  const normalizedConversationId = typeof conversationId === "string" ? conversationId.trim() : "";
  if (!normalizedConversationId) {
    return;
  }

  const observers = conversationToolEventObservers.get(normalizedConversationId);
  if (!observers || observers.size === 0) {
    return;
  }

  for (const observer of observers) {
    observer(detail);
  }
}
