import { createBrowserRouter } from "react-router-dom";
import App from "../App";
import Home from "../pages/Home";
import LoginPage from "../pages/Auth/Login";
import SignupPage from "../pages/Auth/Signup";
import ProfilePage from "../pages/Profile";
import TopicPage from "../pages/TopicDetail";
import AnalyticsPage from "../pages/Analytics";
import ImportContextPage from "../pages/ImportContext";
import StageRouter from "../components/StageRouter";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/login", element: <LoginPage /> },
      { path: "/signup", element: <SignupPage /> },
      { path: "/app", element: <StageRouter /> },
      { path: "/profile", element: <ProfilePage /> },
      { path: "/import", element: <ImportContextPage /> },
      { path: "/topic/:nodeId", element: <TopicPage /> },
      { path: "/analytics", element: <AnalyticsPage /> },
    ],
  },
]);
