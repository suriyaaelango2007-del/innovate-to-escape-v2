import Image from "next/image";
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

export default function Header() {
  return (
    <header className="mx-auto w-full max-w-6xl px-5 pt-6 sm:px-8">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Prodinno Club"
            width={120}
            height={36}
            priority
            className="h-9 w-auto"
          />
        </Link>

        <nav className="hidden items-center gap-2 sm:flex">
          <Link href="/play" className="pill-ghost">
            Play
          </Link>
          <Link href="/leaderboard" className="pill-ghost">
            Leaderboard
          </Link>
          <SignedIn>
            <Link href="/my-attempts" className="pill-ghost">
              My games
            </Link>
          </SignedIn>
          <Link href="/admin" className="pill-outline text-xs">
            Admin
          </Link>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="pill-ghost">Sign in</button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="pill-primary text-sm">Sign up</button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </nav>

        <nav className="flex items-center gap-1 sm:hidden">
          <Link href="/play" className="pill-ghost text-xs">
            Play
          </Link>
          <Link href="/leaderboard" className="pill-ghost text-xs">
            Board
          </Link>
          <SignedIn>
            <Link href="/my-attempts" className="pill-ghost text-xs">
              Mine
            </Link>
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="pill-ghost text-xs">Sign in</button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </nav>
      </div>
    </header>
  );
}
