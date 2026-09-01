import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { ProfileProvider } from './context/ProfileProvider'
import { Header } from './components/Header'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RequireProfile } from './components/RequireProfile'
import { RequireAdmin } from './components/RequireAdmin'
import { LoginPage } from './pages/LoginPage'
import { LandingPage } from './pages/LandingPage'
import { InvitePage } from './pages/InvitePage'
import { VerifyEmailPage } from './pages/VerifyEmailPage'
import { TodayPage } from './pages/TodayPage'
import { ClosetPage } from './pages/ClosetPage'
import { MirrorPage } from './pages/MirrorPage'
import { CirclePage } from './pages/CirclePage'
import { WelcomePage } from './pages/WelcomePage'
import { ProfilePage } from './pages/ProfilePage'
import { JournalPage } from './pages/JournalPage'
import { QuizPage } from './pages/QuizPage'
import { PackingPage } from './pages/PackingPage'
import { FriendsPage } from './pages/FriendsPage'
import { UserProfilePage } from './pages/UserProfilePage'
import { AdminPage } from './pages/AdminPage'
import { BillingPage } from './pages/BillingPage'
import { NotFoundPage } from './pages/NotFoundPage'

function guarded(element: JSX.Element, withProfile = true) {
  return (
    <ProtectedRoute>{withProfile ? <RequireProfile>{element}</RequireProfile> : element}</ProtectedRoute>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProfileProvider>
          <div className="relative min-h-screen">
            <div
              aria-hidden
              className="pointer-events-none fixed inset-0 dark:hidden"
              style={{
                background:
                  'radial-gradient(480px 300px at -6% -8%, rgba(217,72,31,0.05), transparent 65%), radial-gradient(460px 300px at 106% 106%, rgba(229,71,109,0.04), transparent 65%)',
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none fixed inset-0 hidden dark:block"
              style={{
                background:
                  'radial-gradient(520px 340px at -6% -8%, rgba(229,71,109,0.13), transparent 62%), radial-gradient(500px 330px at 106% 106%, rgba(255,122,80,0.09), transparent 62%)',
              }}
            />
            <Header />
            <main>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/landing" element={<LandingPage />} />
                <Route path="/invite" element={<InvitePage />} />
                <Route path="/register" element={<Navigate to="/landing" replace />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />

                {/* The four spaces */}
                <Route path="/" element={guarded(<TodayPage />)} />
                <Route path="/closet" element={guarded(<ClosetPage />)} />
                <Route path="/mirror" element={guarded(<MirrorPage />)} />
                <Route path="/circle" element={guarded(<CirclePage />)} />
                <Route path="/circle/people" element={guarded(<FriendsPage />)} />
                <Route path="/u/:handle" element={guarded(<UserProfilePage />)} />

                {/* First run */}
                <Route path="/welcome" element={guarded(<WelcomePage />, false)} />
                <Route path="/quiz" element={guarded(<QuizPage />, false)} />

                {/* Menu destinations */}
                <Route path="/trips" element={guarded(<PackingPage />)} />
                <Route path="/profile" element={guarded(<ProfilePage />, false)} />
                <Route path="/journal" element={guarded(<JournalPage />)} />
                <Route path="/billing" element={guarded(<BillingPage />, false)} />
                <Route path="/admin" element={guarded(<RequireAdmin><AdminPage /></RequireAdmin>, false)} />

                {/* Old structure → new spaces */}
                <Route path="/wardrobe" element={<Navigate to="/closet" replace />} />
                <Route path="/looks" element={<Navigate to="/mirror" replace />} />
                <Route path="/tryons" element={<Navigate to="/mirror" replace />} />
                <Route path="/friends" element={<Navigate to="/circle" replace />} />
                <Route path="/packing" element={<Navigate to="/trips" replace />} />

                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </main>
          </div>
        </ProfileProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
