import { Link, useLocation, useNavigate } from "react-router-dom";
import { clearAuth, getAuth } from "../session";

const LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/roadmap", label: "Roadmap" },
  { to: "/chat", label: "Chat" },
  { to: "/import", label: "Import AI Context" },
];

export default function NavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = getAuth();

  function handleLogout() {
    clearAuth();
    navigate("/login");
  }

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 px-6 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-4">
        {LINKS.map((link) => (
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
