interface UserAvatarProps {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  className?: string;
}

export default function UserAvatar({
  name,
  email,
  avatarUrl,
  className = "h-8 w-8 rounded-lg border border-line-bright",
}: UserAvatarProps) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name || email || ""}
        className={`${className} object-cover`}
        referrerPolicy="no-referrer"
      />
    );
  }

  const initial = (name || email || "?").trim().charAt(0).toUpperCase();

  return (
    <span
      className={`${className} flex items-center justify-center border-green/30 bg-green/10 font-mono text-xs font-semibold text-green`}
    >
      {initial}
    </span>
  );
}
