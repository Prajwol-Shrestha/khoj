import ChatWindow from "@/components/ChatWindow";
interface ChatPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session?: string | string[] }>;
}

export default async function ChatPage({
  params,
  searchParams,
}: ChatPageProps) {
  const { id } = await params;
  const { session } = await searchParams;
  const initialSessionId = Array.isArray(session) ? session[0] : session;

  return <ChatWindow id={id} initialSessionId={initialSessionId} />;
}
