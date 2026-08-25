import { Link, useLocation, useNavigate } from "react-router-dom";
import { clearAuth, getAuth } from "../session";

const BASE_LINKS = [
  { to: "/chat", label: "Chat" },
  { to: "/profile", label: "Profile" },
];

const ROADMAP_LINK = { to: "/dashboard", label: "Dashboard" };

interface Props {
  // Whether this session has a roadmap yet - controls whether "Dashboard"
  // shows up. Nav stays deliberately small (2-3 items, not 6): a link to
  // a page that can't do anything useful yet is clutter, not navigation.
  // Defaults to false (the safe/smaller set) for pages that don't have
  // this info handy rather than risk a dead-end link.
  hasRoadmap?: boolean;
}

export default function NavBar({ hasRoadmap = false }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = getAuth();
  const links = hasRoadmap ? [ROADMAP_LINK, ...BASE_LINKS] : BASE_LINKS;

  function handleLogout() {
    clearAuth();
    navigate("/login");
  }

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 px-6 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-4">
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={`font-medium transition ${
              location.pathname === link.to ? "text-indigo-400" : "text-slate-400 hover:text-white"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-3 text-slate-400">
        {auth && <span className="hidden sm:inline">{auth.username}</span>}
        <button
          onClick={handleLogout}
          className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium transition hover:bg-slate-700"
        >
          Log out
        </button>
      </div>
    </nav>
  );
}
