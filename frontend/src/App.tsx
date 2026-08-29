import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Chat from "./pages/Chat";
import RoadmapReview from "./pages/RoadmapReview";
import Dashboard from "./pages/Dashboard";
import TopicDetail from "./pages/TopicDetail";
import Complete from "./pages/Complete";
import ImportContext from "./pages/ImportContext";
import Profile from "./pages/Profile";
import Analytics from "./pages/Analytics";
import { CursorFollower, ParticleField } from "./components/effects";

export default function App() {
  return (
    <BrowserRouter>
      <CursorFollower />
      <ParticleField />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/roadmap" element={<RoadmapReview />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/topic/:nodeId" element={<TopicDetail />} />
        <Route path="/complete" element={<Complete />} />
        <Route path="/import" element={<ImportContext />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
