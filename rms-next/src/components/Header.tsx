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
      <div className="flex h-[72px] w-full items-center justify-between gap-3 px-4 sm:px-6">
        <div className="min-w-0 flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 sm:h-10 sm:w-10">
            <Image
              src="/rbm-logo.svg"
              alt="RBM"
              width={22}
              height={22}
              style={{ width: "auto", height: "auto" }}
            />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold leading-tight tracking-tight sm:text-[17px]">
              RBM Software
            </div>
            <div className="hidden text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55 sm:block">
              Resource Management System
            </div>
          </div>
        </div>

        {user ? (
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-2.5 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-60 sm:px-3"
            >
              <LogOut className="h-4 w-4 sm:mr-2" aria-hidden />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
};

export default Header;
