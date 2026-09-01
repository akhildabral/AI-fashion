import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { ProfileProvider } from './context/ProfileProvider'
import { Header } from './components/Header'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RequireProfile } from './components/RequireProfile'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
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
                  'radial-gradient(700px 380px at 12% -4%, rgba(217,72,31,0.055), transparent 60%), radial-gradient(640px 400px at 92% 104%, rgba(184,117,73,0.05), transparent 62%)',
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none fixed inset-0 hidden dark:block"
              style={{
                background:
                  'radial-gradient(700px 400px at 14% -4%, rgba(255,122,80,0.10), transparent 60%), radial-gradient(640px 420px at 92% 104%, rgba(224,165,74,0.08), transparent 62%)',
              }}
            />
            <Header />
            <main>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
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
                <Route path="/admin" element={guarded(<AdminPage />, false)} />

                {/* Old structure → new spaces */}
                <Route path="/wardrobe" element={<Navigate to="/closet" replace />} />
                <Route path="/looks" element={<Navigate to="/mirror" replace />} />
                <Route path="/tryons" element={<Navigate to="/mirror" replace />} />
                <Route path="/friends" element={<Navigate to="/circle" replace />} />
                <Route path="/packing" element={<Navigate to="/trips" replace />} />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </ProfileProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
