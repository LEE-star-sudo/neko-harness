import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { startNekoApp } from "./lib/bootstrap";
import { ChatPage } from "./pages/chat-page";
import { SettingsPage } from "./pages/settings-page";
import "./styles.css";

const rootRoute = createRootRoute({ component: () => <Outlet /> });
const chatRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: ChatPage });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: SettingsPage });
const routeTree = rootRoute.addChildren([chatRoute, settingsRoute]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const queryClient = new QueryClient();

startNekoApp();

const container = document.getElementById("root");
if (container !== null) {
	createRoot(container).render(
		<StrictMode>
			<QueryClientProvider client={queryClient}>
				<RouterProvider router={router} />
			</QueryClientProvider>
		</StrictMode>,
	);
}
