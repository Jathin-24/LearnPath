import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import AuthGuard from "./components/AuthGuard";
import AITutorWidget from "./components/AITutorWidget";
import Sidebar from "./components/Sidebar";
import { AppStateProvider } from "./context/AppStateContext";
import { ToastProvider } from "./context/ToastContext";
import { useAppState } from "./context/AppStateContext";
import { learnerProfileComplete } from "./utils/profile";

const PUBLIC_ROUTES = ["/", "/login", "/signup"];

function AppChrome() {
  const location = useLocation();
  const isPublicRoute = PUBLIC_ROUTES.includes(location.pathname);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { state } = useAppState();
  const profileComplete = learnerProfileComplete(state?.learner_profile ?? null);

  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  return (
    <>
      {!isPublicRoute && <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(v => !v)} />}

      {/* Main content wrapper, adjusting for Sidebar widths when applicable */}
      <main className={`flex-1 w-full flex flex-col min-h-screen relative pb-16 lg:pb-0 ${!isPublicRoute ? (sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64') : ''}`}>
        <div className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>

      {!isPublicRoute && profileComplete && <AITutorWidget />}
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppStateProvider>
        <div className="lp-app-shell flex min-h-screen font-sans antialiased">
          <AuthGuard>
            <AppChrome />
          </AuthGuard>
        </div>
      </AppStateProvider>
    </ToastProvider>
  );
}
