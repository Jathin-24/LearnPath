import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppState } from "../context/AppStateContext";

const PUBLIC_ROUTES = ["/", "/login", "/signup"];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { auth, state, isLoading } = useAppState();

  useEffect(() => {
    if (isLoading) return;

    const isPublicRoute = PUBLIC_ROUTES.includes(location.pathname);

    if (!auth) {
      if (!isPublicRoute) {
        navigate("/login", { replace: true });
      }
      return;
    }

    if (isPublicRoute && state) {
      // For now, StageRouter handles the core app at /app.
      // We can redirect them to /app and let StageRouter handle the specific view.
      // Or we can keep using routeForStage for specific separate URLs if we want.
      // But based on the new design, /app is the stage router.
      navigate("/app", { replace: true });
    }
  }, [auth, state, isLoading, location.pathname, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-slate-400/30 border-t-slate-400 animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
