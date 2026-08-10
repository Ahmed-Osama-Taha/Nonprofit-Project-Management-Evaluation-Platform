"use client";

import Link from "next/link";
import { useAuth, homeForRole } from "@/lib/auth";

export function NavBar() {
  const { user, logout } = useAuth();

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href={user ? homeForRole(user.role) : "/login"} className="brand">
          Non<span>profit</span> Platform
        </Link>
        {user && (
          <div className="nav-links">
            {user.role === "organization" && (
              <>
                <Link href="/projects">My Projects</Link>
                <Link href="/projects/new">New Project</Link>
              </>
            )}
            {user.role === "reviewer" && <Link href="/reviewer">Review Queue</Link>}
            {user.role === "admin" && (
              <>
                <Link href="/admin">Dashboard</Link>
                <Link href="/reviewer">Projects</Link>
              </>
            )}
          </div>
        )}
        <div className="nav-spacer" />
        {user ? (
          <div className="flex">
            <span className="nav-user">
              {user.full_name} <span className="pill">{user.role}</span>
            </span>
            <button className="btn btn-secondary btn-sm" onClick={logout}>
              Logout
            </button>
          </div>
        ) : (
          <Link href="/login" className="btn btn-sm">
            Login
          </Link>
        )}
      </div>
    </nav>
  );
}
