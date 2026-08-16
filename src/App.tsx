import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

import Barcode from './pages/user/Barcode';
import Profile from './pages/user/Profile';
import Rewards from './pages/user/Rewards';
import RedemptionHistory from './pages/user/RedemptionHistory';
import PointHistory from './pages/user/PointHistory';

import Dashboard from './pages/admin/Dashboard';
import Scan from './pages/admin/Scan';
import Members from './pages/admin/Members';
import RewardsAdmin from './pages/admin/Rewards';
import PointRulesAdmin from './pages/admin/PointRules';
import Transactions from './pages/admin/Transactions';
import RedemptionsAdmin from './pages/admin/Redemptions';
import LandingContentAdmin from './pages/admin/LandingContent';

function AppEntry() {
  const { profile, loading } = useAuth();
  if (loading) return null;
  if (!profile) return <Navigate to="/login" replace />;
  return <Navigate to={profile.role === 'admin' ? '/admin' : '/barcode'} replace />;
}

function withLayout(node: ReactNode) {
  return <Layout>{node}</Layout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<AppEntry />} />

          {/* User */}
          <Route
            path="/barcode"
            element={<ProtectedRoute role="user">{withLayout(<Barcode />)}</ProtectedRoute>}
          />
          <Route path="/profile" element={<ProtectedRoute>{withLayout(<Profile />)}</ProtectedRoute>} />
          <Route
            path="/rewards"
            element={<ProtectedRoute role="user">{withLayout(<Rewards />)}</ProtectedRoute>}
          />
          <Route
            path="/rewards/history"
            element={<ProtectedRoute role="user">{withLayout(<RedemptionHistory />)}</ProtectedRoute>}
          />
          <Route
            path="/points-history"
            element={<ProtectedRoute role="user">{withLayout(<PointHistory />)}</ProtectedRoute>}
          />

          {/* Admin */}
          <Route path="/admin" element={<ProtectedRoute role="admin">{withLayout(<Dashboard />)}</ProtectedRoute>} />
          <Route
            path="/admin/scan"
            element={<ProtectedRoute role="admin">{withLayout(<Scan />)}</ProtectedRoute>}
          />
          <Route
            path="/admin/members"
            element={<ProtectedRoute role="admin">{withLayout(<Members />)}</ProtectedRoute>}
          />
          <Route
            path="/admin/rewards"
            element={<ProtectedRoute role="admin">{withLayout(<RewardsAdmin />)}</ProtectedRoute>}
          />
          <Route
            path="/admin/point-rules"
            element={<ProtectedRoute role="admin">{withLayout(<PointRulesAdmin />)}</ProtectedRoute>}
          />
          <Route
            path="/admin/transactions"
            element={<ProtectedRoute role="admin">{withLayout(<Transactions />)}</ProtectedRoute>}
          />
          <Route
            path="/admin/redemptions"
            element={<ProtectedRoute role="admin">{withLayout(<RedemptionsAdmin />)}</ProtectedRoute>}
          />
          <Route
            path="/admin/landing-content"
            element={<ProtectedRoute role="admin">{withLayout(<LandingContentAdmin />)}</ProtectedRoute>}
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
