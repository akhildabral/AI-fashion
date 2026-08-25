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
