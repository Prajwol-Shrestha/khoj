// id is a document id or a collection id — /chat/[id] accepts either
export function chatHref(id: string, sessionId?: string): string {
  return sessionId ? `/chat/${id}?session=${sessionId}` : `/chat/${id}`;
}
