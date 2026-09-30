import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { CallbackPage } from "@/auth/CallbackPage";
import { RequireAuth } from "@/auth/RequireAuth";
import { SilentRenewPage } from "@/auth/SilentRenewPage";
import { AppShell } from "@/components/AppShell";
import { PublicShell } from "@/components/PublicShell";
import { AdminPage } from "@/pages/AdminPage";
import { ContextDetailPage } from "@/pages/ContextDetailPage";
import { ContextsPage } from "@/pages/ContextsPage";
import { DeviceDetailPage } from "@/pages/DeviceDetailPage";
import { DevicesPage } from "@/pages/DevicesPage";
import { LandingPage } from "@/pages/LandingPage";
import { LibraryConfigPage } from "@/pages/LibraryConfigPage";
import { LibraryPage } from "@/pages/LibraryPage";
import { LoginPage } from "@/pages/LoginPage";
import { NotificationsPage } from "@/pages/NotificationsPage";
import { SignupPage } from "@/pages/SignupPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public site */}
        <Route element={<PublicShell />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signup" element={<SignupPage />} />
        </Route>

        {/* Standalone auth screens */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/callback" element={<CallbackPage />} />
        <Route path="/silent-renew" element={<SilentRenewPage />} />

        {/* Authenticated app */}
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<Navigate to="/contexts" replace />} />
            <Route path="/contexts" element={<ContextsPage />} />
            <Route path="/contexts/:contextId" element={<ContextDetailPage />} />
            <Route path="/devices" element={<DevicesPage />} />
            <Route path="/devices/:deviceId" element={<DeviceDetailPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/library/:kind/:id" element={<LibraryConfigPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
