import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { ProfileProvider } from './context/ProfileProvider'
import { useProfile } from './context/useProfile'
import { useEffect } from 'react'
import { setCurrentCurrency } from './lib/money'
import { setCurrentUnits } from './lib/units'
import { Header } from './components/Header'
import { JobsProvider } from './context/JobsProvider'
import { JobTray } from './components/JobTray'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RequireProfile } from './components/RequireProfile'
import { RequireAdmin } from './components/RequireAdmin'
import { LoginPage } from './pages/LoginPage'
import { LandingPage } from './pages/LandingPage'
import { InvitePage } from './pages/InvitePage'
import { JoinPage } from './pages/JoinPage'
import { ForgotPage } from './pages/ForgotPage'
import { ResetPage } from './pages/ResetPage'
import { VerifyEmailPage } from './pages/VerifyEmailPage'
import { PrivacyPage, TermsPage } from './pages/LegalPage'
import { TodayPage } from './pages/TodayPage'
import { ClosetPage } from './pages/ClosetPage'
import { PiecePage } from './pages/PiecePage'
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
import { TripPage } from './pages/TripPage'
import { UserProfilePage } from './pages/UserProfilePage'
import { AdminPage } from './pages/AdminPage'
import { BillingPage } from './pages/BillingPage'
import { NotFoundPage } from './pages/NotFoundPage'

/** Every figure prints in the member's currency and units once the profile is known. */
function CurrencySync() {
  const { profile } = useProfile()
  useEffect(() => {
    setCurrentCurrency(profile?.currency ?? null)
    setCurrentUnits(profile?.units ?? null)
  }, [profile?.currency, profile?.units])
  return null
}

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
         <JobsProvider>
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
            <CurrencySync />
            <Header />
            <JobTray />
            <main>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/landing" element={<LandingPage />} />
                <Route path="/invite" element={<InvitePage />} />
                <Route path="/join/:code" element={<JoinPage />} />
                <Route path="/forgot" element={<ForgotPage />} />
                <Route path="/reset" element={<ResetPage />} />
                <Route path="/register" element={<Navigate to="/landing" replace />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/terms" element={<TermsPage />} />

                {/* The four spaces */}
                <Route path="/" element={guarded(<TodayPage />)} />
                <Route path="/closet" element={guarded(<ClosetPage />)} />
                <Route path="/closet/piece/:id" element={guarded(<PiecePage />)} />
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
                <Route path="/trips/:id" element={guarded(<TripPage />)} />
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
         </JobsProvider>
        </ProfileProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
