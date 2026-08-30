import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import AuthGuard from "./components/AuthGuard";
import AITutorWidget from "./components/AITutorWidget";
import Sidebar from "./components/Sidebar";
import { AppStateProvider } from "./context/AppStateContext";
import { ToastProvider } from "./context/ToastContext";

const PUBLIC_ROUTES = ["/", "/login", "/signup"];

export default function App() {
  const location = useLocation();
  const isPublicRoute = PUBLIC_ROUTES.includes(location.pathname);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  return (
    <ToastProvider>
      <AppStateProvider>
        <div className="flex min-h-screen bg-slate-950 font-sans text-slate-300 antialiased selection:bg-slate-400/30">
          
          <AuthGuard>
            {!isPublicRoute && <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(v => !v)} />}
            
            {/* Main content wrapper, adjusting for Sidebar widths when applicable */}
            <main className={`flex-1 w-full flex flex-col min-h-screen relative pb-16 lg:pb-0 ${!isPublicRoute ? (sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64') : ''}`}>
              <div className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
                <Outlet />
              </div>
            </main>
            
            {!isPublicRoute && <AITutorWidget />}
          </AuthGuard>
          
        </div>
      </AppStateProvider>
    </ToastProvider>
  );
}
