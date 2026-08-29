import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { clearAuth, getAuth } from "../session";
import ThemeToggle from "./ThemeToggle";

const BASE_LINKS = [
  { to: "/chat", label: "Chat" },
  { to: "/profile", label: "Profile" },
];

const ROADMAP_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/roadmap", label: "Roadmap" },
  { to: "/analytics", label: "Analytics" },
];

interface Props {
  hasRoadmap?: boolean;
}

export default function NavBar({ hasRoadmap = false }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = getAuth();
  const links = hasRoadmap ? [...ROADMAP_LINKS, ...BASE_LINKS] : BASE_LINKS;

  function handleLogout() {
    clearAuth();
    navigate("/login");
  }

  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface/90 backdrop-blur-md px-6 py-3 sticky top-0 z-50"
    >
      <div className="flex flex-wrap items-center gap-6">
        <Link
          to={hasRoadmap ? "/dashboard" : "/"}
          className="text-base font-semibold tracking-tight"
        >
          <motion.span
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="inline-block"
          >
            LearnPath
          </motion.span>
        </Link>
        <div className="flex items-center gap-1">
          {links.map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <Link key={link.to} to={link.to}>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`
                    px-3 py-1.5 text-xs font-medium rounded-md
                    transition-colors duration-150
                    ${isActive
                      ? "bg-fg text-white dark:bg-accent dark:text-[#0A0A0A]"
                      : "text-fg-secondary hover:text-fg hover:bg-bg-secondary"
                    }
                  `}
                >
                  {link.label}
                </motion.div>
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        {auth && (
          <span className="hidden sm:inline text-xs text-fg-muted font-medium">
            {auth.username}
          </span>
        )}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleLogout}
          className="px-3 py-1.5 text-xs font-medium text-fg-secondary
            hover:text-fg hover:bg-bg-secondary rounded-md
            transition-colors duration-150"
        >
          Log out
        </motion.button>
      </div>
    </motion.nav>
  );
}
