import { useAppState } from "../context/AppStateContext";
import PageSkeleton from "./Skeleton";
import Chat from "../pages/Chat";
import RoadmapReview from "../pages/RoadmapReview";
import Dashboard from "../pages/Dashboard";
import Complete from "../pages/Complete";

export default function StageRouter() {
  const { state, isLoading, error, refreshState } = useAppState();

  if (isLoading) return <PageSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
        <h1 className="text-2xl font-bold text-red-500 mb-4">Something unexpected happened.</h1>
        <p className="text-slate-400 mb-6">{error}</p>
        <button onClick={refreshState} className="bg-slate-100 px-6 py-2 rounded-lg text-slate-900 font-semibold">
          Reload state
        </button>
      </div>
    );
  }

  if (!state) return null;

  switch (state.stage) {
    case "onboarding":
    case "assessment":
    case "path_selection":
    case "roadmap_generation":
      return <Chat />; // Chat currently handles all these phases internally
    case "roadmap_review":
      return <RoadmapReview />;
    case "in_progress":
    case "topic_assessment":
      return <Dashboard />;
    case "complete":
      return <Complete />;
    default:
      return (
        <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
          <h1 className="text-2xl font-bold text-red-500 mb-4">Something unexpected happened.</h1>
          <p className="text-slate-400 mb-6">Unknown stage: {state.stage}</p>
          <button onClick={refreshState} className="bg-slate-100 px-6 py-2 rounded-lg text-slate-900 font-semibold">
            Reload state
          </button>
        </div>
      );
  }
}
