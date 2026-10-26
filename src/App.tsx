import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

import Home from './pages/user/Home';
import Profile from './pages/user/Profile';
import Rewards from './pages/user/Rewards';
import RedemptionHistory from './pages/user/RedemptionHistory';
import PointHistory from './pages/user/PointHistory';
import Products from './pages/user/Products';
import OrderHistory from './pages/user/OrderHistory';
import PromoCheckout from './pages/user/PromoCheckout';

import Dashboard from './pages/admin/Dashboard';
import Scan from './pages/admin/Scan';
import ScanCheckout from './pages/admin/ScanCheckout';
import Members from './pages/admin/Members';
import MemberCardPrint from './pages/admin/MemberCardPrint';
import RewardsAdmin from './pages/admin/Rewards';
import PointRulesAdmin from './pages/admin/PointRules';
import Transactions from './pages/admin/Transactions';
import RedemptionsAdmin from './pages/admin/Redemptions';
import LandingContentAdmin from './pages/admin/LandingContent';
import ProductsAdmin from './pages/admin/Products';
import PromosAdmin from './pages/admin/Promos';
import OrdersAdmin from './pages/admin/Orders';
import Kelola from './pages/admin/Kelola';
import Transaksi from './pages/admin/Transaksi';

function AppEntry() {
  const { profile, loading } = useAuth();
  if (loading) return null;
  if (!profile) return <Navigate to="/login" replace />;
  return <Navigate to={profile.role === 'admin' ? '/admin' : '/home'} replace />;
}

function withLayout(node: ReactNode) {
  return <Layout>{node}</Layout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<AppEntry />} />

          {/* User */}
          <Route path="/home" element={<ProtectedRoute role="user">{withLayout(<Home />)}</ProtectedRoute>} />
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
          <Route
            path="/products"
            element={<ProtectedRoute role="user">{withLayout(<Products />)}</ProtectedRoute>}
          />
          <Route
            path="/orders/history"
            element={<ProtectedRoute role="user">{withLayout(<OrderHistory />)}</ProtectedRoute>}
          />
          <Route
            path="/promos/:id"
            element={<ProtectedRoute role="user">{withLayout(<PromoCheckout />)}</ProtectedRoute>}
          />

          {/* Admin */}
          <Route path="/admin" element={<ProtectedRoute role="admin">{withLayout(<Dashboard />)}</ProtectedRoute>} />
          <Route
            path="/admin/scan"
            element={<ProtectedRoute role="admin">{withLayout(<Scan />)}</ProtectedRoute>}
          />
          <Route
            path="/admin/scan-checkout"
            element={<ProtectedRoute role="admin">{withLayout(<ScanCheckout />)}</ProtectedRoute>}
          />
          <Route
            path="/admin/kelola"
            element={<ProtectedRoute role="admin">{withLayout(<Kelola />)}</ProtectedRoute>}
          />
          <Route
            path="/admin/transaksi"
            element={<ProtectedRoute role="admin">{withLayout(<Transaksi />)}</ProtectedRoute>}
          />
          <Route
            path="/admin/members"
            element={<ProtectedRoute role="admin">{withLayout(<Members />)}</ProtectedRoute>}
          />
          <Route
            path="/admin/members/:id/card"
            element={<ProtectedRoute role="admin">{withLayout(<MemberCardPrint />)}</ProtectedRoute>}
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
          <Route
            path="/admin/products"
            element={<ProtectedRoute role="admin">{withLayout(<ProductsAdmin />)}</ProtectedRoute>}
          />
          <Route
            path="/admin/promos"
            element={<ProtectedRoute role="admin">{withLayout(<PromosAdmin />)}</ProtectedRoute>}
          />
          <Route
            path="/admin/orders"
            element={<ProtectedRoute role="admin">{withLayout(<OrdersAdmin />)}</ProtectedRoute>}
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
