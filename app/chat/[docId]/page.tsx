import ChatWindow from "@/components/ChatWindow";
interface ChatPageProps {
  params: Promise<{ docId: string }>;
  searchParams: Promise<{ session?: string | string[] }>;
}

export default async function ChatPage({
  params,
  searchParams,
}: ChatPageProps) {
  const { docId } = await params;
  const { session } = await searchParams;
  const initialSessionId = Array.isArray(session) ? session[0] : session;

  return <ChatWindow docId={docId} initialSessionId={initialSessionId} />;
}
