import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { ProfileProvider } from './context/ProfileProvider'
import { Header } from './components/Header'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RequireProfile } from './components/RequireProfile'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { StylistPage } from './pages/StylistPage'
import { ProfilePage } from './pages/ProfilePage'
import { LooksPage } from './pages/LooksPage'
import { TryOnsPage } from './pages/TryOnsPage'
import { WardrobePage } from './pages/WardrobePage'
import { JournalPage } from './pages/JournalPage'
import { QuizPage } from './pages/QuizPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProfileProvider>
          <div className="min-h-screen">
            <Header />
            <main>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <RequireProfile>
                        <StylistPage />
                      </RequireProfile>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/looks"
                  element={
                    <ProtectedRoute>
                      <RequireProfile>
                        <LooksPage />
                      </RequireProfile>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/wardrobe"
                  element={
                    <ProtectedRoute>
                      <RequireProfile>
                        <WardrobePage />
                      </RequireProfile>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/quiz"
                  element={
                    <ProtectedRoute>
                      <RequireProfile>
                        <QuizPage />
                      </RequireProfile>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/journal"
                  element={
                    <ProtectedRoute>
                      <RequireProfile>
                        <JournalPage />
                      </RequireProfile>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tryons"
                  element={
                    <ProtectedRoute>
                      <RequireProfile>
                        <TryOnsPage />
                      </RequireProfile>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <ProfilePage />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </ProfileProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
