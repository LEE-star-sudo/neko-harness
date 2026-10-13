import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { startNekoApp } from "./lib/bootstrap";
import { AboutPage } from "./pages/about-page";
import { ChatPage } from "./pages/chat-page";
import { SettingsPage } from "./pages/settings-page";
import { SkillsPage } from "./pages/skills-page";
import "./styles.css";

const rootRoute = createRootRoute({ component: () => <Outlet /> });
const chatRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: ChatPage });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: SettingsPage });
const skillsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/skills", component: SkillsPage });
const aboutRoute = createRoute({ getParentRoute: () => rootRoute, path: "/about", component: AboutPage });
const routeTree = rootRoute.addChildren([chatRoute, settingsRoute, skillsRoute, aboutRoute]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

startNekoApp();

const container = document.getElementById("root");
if (container !== null) {
	createRoot(container).render(
		<StrictMode>
			<RouterProvider router={router} />
		</StrictMode>,
	);
}
