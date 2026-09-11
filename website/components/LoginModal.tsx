"use client";

import AuthModal from "@/components/auth/AuthModal";

type LoginModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export default function LoginModal({
  open,
  onClose,
  onSuccess,
}: LoginModalProps) {
  return (
    <AuthModal
      open={open}
      initialMode="login"
      onClose={onClose}
      onAuthenticated={onSuccess}
    />
  );
}
