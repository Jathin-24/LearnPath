import { Link, useLocation } from "react-router-dom";
import { useAppState } from "../context/AppStateContext";
import { learnerProfileComplete } from "../utils/profile";
import { LayoutDashboard, BarChart3, User, LogOut, Code2, ChevronLeft, ChevronRight, ShieldAlert } from "lucide-react";


export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const location = useLocation();
  const { auth, state, logout } = useAppState();

  const profileComplete = learnerProfileComplete(state?.learner_profile ?? null);

  const links = [];

  // Until the required profile details are filled, the only accessible
  // section is completing the profile.
  if (!profileComplete) {
    links.push({ to: "/profile?required=1", icon: <ShieldAlert className="w-5 h-5" />, label: "Complete Profile" });
  } else {
    if (state?.roadmap) {
      links.push({ to: "/app", icon: <LayoutDashboard className="w-5 h-5" />, label: "Dashboard" });
    }
  
    links.push({ to: "/profile", icon: <User className="w-5 h-5" />, label: "Profile" });
  
    if (state?.roadmap) {
      links.push({ to: "/analytics", icon: <BarChart3 className="w-5 h-5" />, label: "Analytics" });
    }
  }

  // Calculate overall roadmap progress
  const overallPercent = state?.roadmap
    ? Math.round(
        (state.roadmap.nodes.filter((n) => n.status === "complete").length /
          state.roadmap.nodes.length) *
          100
      )
    : 0;

  function handleLogout() {
    logout();
  }

  return (
    <>
      {/* Desktop Sidebar (lg+) */}
      <aside
        className={`hidden lg:flex flex-col fixed inset-y-0 left-0 z-40 transition-all duration-300 ${
          collapsed ? "w-16" : "w-64"
        }`}
        style={{
          backgroundColor: "#020617",
          borderRight: "1px solid #1e293b",
        }}
      >
        {/* Header */}
        <div
          className={`flex items-center border-b ${collapsed ? "flex-col justify-center gap-2 p-3" : "gap-3 p-6"}`}
          style={{ borderColor: "#1e293b" }}
        >
          <Link
            to="/app"
            aria-label="Go to dashboard"
            className={`group flex items-center ${collapsed ? "flex-col justify-center gap-2" : "gap-3"} shrink-0`}
          >
            <div className="bg-slate-400/20 p-2 rounded-xl group-hover:bg-slate-500/30 transition shrink-0">
              <Code2 className="w-6 h-6 text-slate-300" />
            </div>
            {!collapsed && (
              <span className="font-bold font-display text-lg tracking-tight group-hover:text-white transition" style={{ color: "#f1f5f9" }}>
                LearnPath
              </span>
            )}
          </Link>
          <button
            onClick={onToggle}
            className={`flex items-center justify-center rounded-xl transition p-2 ${collapsed ? "" : "ml-auto"}`}
            style={{ color: "#64748b" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#f1f5f9";
              e.currentTarget.style.backgroundColor = "#1e293b";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#64748b";
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>
        
        {/* Nav Links */}
        <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
          {links.map((link) => {
            const linkPath = link.to.split("?")[0];
            const isActive = linkPath === "/app"
              ? location.pathname === "/app" || location.pathname.startsWith("/topic/")
              : location.pathname === linkPath;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`flex items-center gap-3 rounded-xl transition font-medium relative ${
                  collapsed ? "justify-center px-2 py-3" : "px-4 py-3"
                }`}
                style={
                  isActive
                    ? {
                        backgroundColor: "#1e293b",
                        color: "#e2e8f0",
                        boxShadow: "inset 3px 0 0 #94a3b8",
                      }
                    : {
                        color: "#94a3b8",
                      }
                }
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = "#1e293b";
                    e.currentTarget.style.color = "#f1f5f9";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "#94a3b8";
                  }
                }}
                aria-current={isActive ? "page" : undefined}
                title={collapsed ? link.label : undefined}
              >
                {link.icon}
                {!collapsed && <span>{link.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Progress Bar (only when collapsed=false and roadmap exists) */}
        {!collapsed && state?.roadmap && (
          <div className="px-4 py-3">
            <p className="text-xs font-medium mb-1.5" style={{ color: "#64748b" }}>
              Progress
            </p>
            <div
              className="h-1.5 w-full rounded-full overflow-hidden"
              style={{ backgroundColor: "#020617" }}
            >
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${overallPercent}%`,
                  background: "linear-gradient(135deg, #94a3b8, #94a3b8)",
                }}
              />
            </div>
            <p className="text-xs mt-1" style={{ color: "#64748b" }}>
              {overallPercent}% complete
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="p-3 border-t" style={{ borderColor: "#1e293b" }}>
          {/* User Info */}
          <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : "px-3"} mb-2`}>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
              style={{
                backgroundColor: "#1e293b",
                color: "#94a3b8",
              }}
            >
              {auth?.username?.charAt(0).toUpperCase() || "G"}
            </div>
            {!collapsed && (
              <p className="text-sm font-semibold truncate" style={{ color: "#f1f5f9" }}>
                {auth?.username || "Guest"}
              </p>
            )}
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className={`flex items-center gap-3 rounded-xl transition font-medium p-2 ${
              collapsed ? "justify-center" : "flex-1 px-3"
            }`}
            style={{ color: "#64748b" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#f1f5f9";
              e.currentTarget.style.backgroundColor = "#1e293b";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#64748b";
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            aria-label="Log out"
          >
              <LogOut className="w-5 h-5" />
              {!collapsed && <span>Log out</span>}
            </button>
        </div>
      </aside>

      {/* Mobile Bottom Tab Bar (sm to md) */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 backdrop-blur-xl z-40"
        style={{
          backgroundColor: "#0f172a",
          borderTop: "1px solid #1e293b",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex items-center justify-around px-2 py-2">
          {links.map((link) => {
            const linkPath = link.to.split("?")[0];
            const isActive = linkPath === "/app"
              ? location.pathname === "/app" || location.pathname.startsWith("/topic/")
              : location.pathname === linkPath;
            return (
              <Link
                key={link.to}
                to={link.to}
                className="flex flex-col items-center justify-center w-16 h-14 rounded-xl transition"
                style={{
                  color: isActive ? "#e2e8f0" : "#94a3b8",
                }}
                aria-current={isActive ? "page" : undefined}
              >
                <div className={`mb-1 ${isActive ? "scale-110 transition-transform" : ""}`}>
                  {link.icon}
                </div>
                <span className="text-[10px] font-medium">{link.label}</span>
              </Link>
            );
          })}
          <button
            onClick={handleLogout}
            className="flex flex-col items-center justify-center w-16 h-14 rounded-xl transition"
            style={{ color: "#64748b" }}
            aria-label="Log out"
          >
            <div className="mb-1">
              <LogOut className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium">Log out</span>
          </button>
        </div>
      </nav>
    </>
  );
}
