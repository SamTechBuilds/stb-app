import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";
import { ThemeToggle } from "./theme";

const NAV = [
  { to: "/", label: "Overview", icon: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z", end: true },
  { to: "/deliveries", label: "Deliveries", icon: "M4 9h16v11H4zM3 6h18v3H3zM12 6v14M12 6c-2-4-6-3-4 0m4 0c2-4 6-3 4 0" },
  { to: "/projects", label: "Projects", icon: "M4 5h7v6H4zM13 5h7v14h-7zM4 13h7v6H4z" },
  { to: "/clients", label: "Clients", icon: "M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm8 1a3 3 0 1 0 0-6M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6m2-6c2.8.4 5 2.8 5 5.7" },
  { to: "/settings", label: "Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function Layout() {
  const { state, signOut } = useAuth();
  const email = state.kind === "authorized" ? state.email : "";
  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <aside className="sidebar">
        <p className="sidebar__brand">Sam Tech Builds</p>
        <nav aria-label="Main">
          <ul>
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} end={n.end} className="nav-link"><Icon d={n.icon} />{n.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar__foot">
          <ThemeToggle />
          <p className="sidebar__user" title={email}>{email}</p>
          <button type="button" className="link-btn" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <header className="topbar">
        <p className="sidebar__brand">STB</p>
        <ThemeToggle compact />
      </header>
      <main id="main" className="main" tabIndex={-1}>
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Main">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="tab"><Icon d={n.icon} /><span>{n.label}</span></NavLink>
        ))}
      </nav>
    </div>
  );
}
