import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Chat from "./pages/Chat";
import RoadmapReview from "./pages/RoadmapReview";
import Dashboard from "./pages/Dashboard";
import TopicDetail from "./pages/TopicDetail";
import Complete from "./pages/Complete";
import ImportContext from "./pages/ImportContext";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/roadmap" element={<RoadmapReview />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/topic/:nodeId" element={<TopicDetail />} />
        <Route path="/complete" element={<Complete />} />
        <Route path="/import" element={<ImportContext />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
