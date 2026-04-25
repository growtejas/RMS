"use client";

import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { useAuth } from "@/contexts/useAuth";

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-black text-white">
      <div className="mx-auto flex min-h-[72px] max-w-[1400px] items-center justify-between px-5 sm:px-7">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5">
            <Image
              src="/rbm-logo.svg"
              alt="RBM"
              width={22}
              height={22}
              style={{ width: "auto", height: "auto" }}
            />
          </div>
          <div className="flex flex-col">
            <div className="text-[17px] font-bold leading-tight tracking-tight">
              RBM Software
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">
              Resource Management System
            </div>
          </div>
        </div>

        {user ? (
          <div className="flex items-center gap-3">
            <div className="hidden text-sm text-white/70 sm:block">
              {user.username}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut className="mr-2 h-4 w-4" aria-hidden />
              Logout
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
};

export default Header;
