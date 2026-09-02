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
import { BasketRoom } from './pages/BasketRoom'
import { OutfitsRoom } from './pages/OutfitsRoom'
import { ComposePage } from './pages/ComposePage'
import { StorePage } from './pages/StorePage'
import { WishlistRoom } from './pages/WishlistRoom'
import { MirrorPage } from './pages/MirrorPage'
import { CirclePage } from './pages/CirclePage'
import { ProfilePage } from './pages/ProfilePage'
import { JournalPage } from './pages/JournalPage'
import { FittingPage } from './pages/FittingPage'
import { PackingPage } from './pages/PackingPage'
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
                  'radial-gradient(680px 460px at 82% -8%, rgba(160,120,40,0.08), transparent 62%), radial-gradient(560px 420px at -8% 10%, rgba(124,45,42,0.05), transparent 60%)',
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none fixed inset-0 hidden dark:block"
              style={{
                background:
                  'radial-gradient(760px 500px at 82% -8%, rgba(200,164,94,0.10), transparent 62%), radial-gradient(620px 440px at -8% 10%, rgba(124,45,42,0.08), transparent 60%)',
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
                <Route path="/closet/basket" element={guarded(<BasketRoom />)} />
                <Route path="/closet/outfits" element={guarded(<OutfitsRoom />)} />
                <Route path="/closet/compose" element={guarded(<ComposePage />)} />
                <Route path="/closet/store" element={guarded(<StorePage />)} />
                <Route path="/closet/wishlist" element={guarded(<WishlistRoom />)} />
                <Route path="/mirror" element={guarded(<MirrorPage />)} />
                <Route path="/circle" element={guarded(<CirclePage />)} />
                {/* People is folded into Circle now — keep the URL working. */}
                <Route path="/circle/people" element={<Navigate to="/circle" replace />} />
                <Route path="/u/:handle" element={guarded(<UserProfilePage />)} />

                {/* First run: the fitting */}
                <Route path="/fitting" element={guarded(<FittingPage />, false)} />
                <Route path="/welcome" element={<Navigate to="/fitting" replace />} />
                <Route path="/quiz" element={<Navigate to="/fitting?s=4" replace />} />

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
