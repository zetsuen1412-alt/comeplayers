"use client";

import AuthModal from "@/components/auth/AuthModal";

type ChatMessagesLoginGateProps = {
  invitedServerName?: string | null;
};

export default function ChatMessagesLoginGate({
  invitedServerName,
}: ChatMessagesLoginGateProps) {
  return (
    <>
      <style>{`
        body.messages-shell > nav:first-of-type,
        body.messages-shell > header:first-of-type,
        body.messages-shell > footer {
          display: none !important;
        }

        body.messages-shell {
          min-height: 100dvh;
          overflow: hidden;
          background: #05070b;
        }
      `}</style>

      <AuthModal
        open
        initialMode="login"
        presentation="page"
        redirectPath="/cpcommunity"
        contextMessage={
          invitedServerName
            ? `Your invitation to ${invitedServerName} will be ready after login.`
            : null
        }
        onAuthenticated={() => {
          window.location.replace(window.location.href);
        }}
        onClose={() => undefined}
      />
    </>
  );
}
