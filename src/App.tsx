import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AuthProvider, useAuth } from './store/auth';
import { ToastProvider } from './store/toast';
import { SettingsContext, FALLBACK_SETTINGS, useSettingsQuery } from './store/settings';
import { Spinner } from './components/ui/primitives';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';

const Router = BrowserRouter;

const Dashboard = lazy(() => import('./pages/Dashboard'));
const POS = lazy(() => import('./pages/POS'));
const Products = lazy(() => import('./pages/Products'));
const Phones = lazy(() => import('./pages/Phones'));
const Accessories = lazy(() => import('./pages/Accessories'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Sales = lazy(() => import('./pages/Sales'));
const Purchases = lazy(() => import('./pages/Purchases'));
const Returns = lazy(() => import('./pages/Returns'));
const Invoices = lazy(() => import('./pages/Invoices'));
const Customers = lazy(() => import('./pages/Customers'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Treasury = lazy(() => import('./pages/Treasury'));
const Reports = lazy(() => import('./pages/Reports'));
const Users = lazy(() => import('./pages/Users'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Backup = lazy(() => import('./pages/Backup'));

function PageFallback() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <Spinner size={28} />
    </div>
  );
}

function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

function withTransition(node: ReactNode) {
  return <PageTransition>{node}</PageTransition>;
}

function Shell() {
  const { user, loading } = useAuth();
  const settingsQuery = useSettingsQuery();
  const settings = settingsQuery.data ?? FALLBACK_SETTINGS;

  if (loading) return <PageFallback />;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <SettingsContext.Provider value={{ settings, currency: settings.currency }}>
      <AppLayout>
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </AppLayout>
    </SettingsContext.Provider>
  );
}

function LoginRoute() {
  const { user, loading } = useAuth();
  const settingsQuery = useSettingsQuery();
  const settings = settingsQuery.data ?? FALLBACK_SETTINGS;
  if (loading) return <PageFallback />;
  if (user) return <Navigate to="/" replace />;
  return (
    <SettingsContext.Provider value={{ settings, currency: settings.currency }}>
      <Login />
    </SettingsContext.Provider>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <Routes location={location}>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/" element={<Shell />}>
        <Route index element={withTransition(<Dashboard />)} />
        <Route path="pos" element={withTransition(<POS />)} />
        <Route path="products" element={withTransition(<Products />)} />
        <Route path="phones" element={withTransition(<Phones />)} />
        <Route path="accessories" element={withTransition(<Accessories />)} />
        <Route path="inventory" element={withTransition(<Inventory />)} />
        <Route path="sales" element={withTransition(<Sales />)} />
        <Route path="purchases" element={withTransition(<Purchases />)} />
        <Route path="returns" element={withTransition(<Returns />)} />
        <Route path="invoices" element={withTransition(<Invoices />)} />
        <Route path="customers" element={withTransition(<Customers />)} />
        <Route path="suppliers" element={withTransition(<Suppliers />)} />
        <Route path="expenses" element={withTransition(<Expenses />)} />
        <Route path="treasury" element={withTransition(<Treasury />)} />
        <Route path="reports" element={withTransition(<Reports />)} />
        <Route path="users" element={withTransition(<Users />)} />
        <Route path="settings" element={withTransition(<SettingsPage />)} />
        <Route path="backup" element={withTransition(<Backup />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Router>
          <AnimatedRoutes />
        </Router>
      </AuthProvider>
    </ToastProvider>
  );
}
