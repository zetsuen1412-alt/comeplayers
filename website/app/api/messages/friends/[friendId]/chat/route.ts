import { POST as openContact } from "@/app/api/messages/contacts/route";

// Compatibility for already-installed clients; friendship approval is no longer required.
export async function POST(request: Request, context: { params: Promise<{ friendId: string }> }) {
  const { friendId } = await context.params;
  return openContact(new Request(request.url, {
    method: "POST", headers: request.headers, body: JSON.stringify({ userId: friendId }),
  }));
}
