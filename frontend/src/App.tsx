import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Landing from "./pages/Landing";
import Chat from "./pages/Chat";
import RoadmapReview from "./pages/RoadmapReview";
import Dashboard from "./pages/Dashboard";
import TopicDetail from "./pages/TopicDetail";
import Complete from "./pages/Complete";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/roadmap" element={<RoadmapReview />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/topic/:nodeId" element={<TopicDetail />} />
        <Route path="/complete" element={<Complete />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
