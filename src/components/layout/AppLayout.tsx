import { useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ScanBarcode, Package, Smartphone, Headphones, Warehouse,
  ShoppingCart, Truck, Undo2, FileText, Users, Building2, Receipt, Wallet,
  BarChart3, UserCog, Settings, DatabaseBackup, LogOut, ChevronFirst,
  Store, KeyRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '@/store/auth';
import { useSettings } from '@/store/settings';
import { Badge } from '@/components/ui/primitives';
import type { PermissionKey } from '@/shared/ipc';

interface NavItem { to: string; label: string; icon: LucideIcon; permission: PermissionKey; preload?: () => Promise<unknown> }
interface NavGroup { title: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    title: 'الرئيسية',
    items: [
      { to: '/', label: 'لوحة التحكم', icon: LayoutDashboard, permission: 'dashboard', preload: () => import('@/pages/Dashboard') },
      { to: '/pos', label: 'نقطة البيع', icon: ScanBarcode, permission: 'pos', preload: () => import('@/pages/POS') },
    ],
  },
  {
    title: 'المخزون',
    items: [
      { to: '/products', label: 'المنتجات', icon: Package, permission: 'products', preload: () => import('@/pages/Products') },
      { to: '/phones', label: 'الهواتف', icon: Smartphone, permission: 'phones', preload: () => import('@/pages/Phones') },
      { to: '/accessories', label: 'الملحقات', icon: Headphones, permission: 'accessories', preload: () => import('@/pages/Accessories') },
      { to: '/inventory', label: 'المخزون', icon: Warehouse, permission: 'inventory', preload: () => import('@/pages/Inventory') },
    ],
  },
  {
    title: 'العمليات',
    items: [
      { to: '/sales', label: 'المبيعات', icon: ShoppingCart, permission: 'sales', preload: () => import('@/pages/Sales') },
      { to: '/purchases', label: 'المشتريات', icon: Truck, permission: 'purchases', preload: () => import('@/pages/Purchases') },
      { to: '/returns', label: 'المرتجعات', icon: Undo2, permission: 'returns', preload: () => import('@/pages/Returns') },
      { to: '/invoices', label: 'الفواتير', icon: FileText, permission: 'invoices', preload: () => import('@/pages/Invoices') },
    ],
  },
  {
    title: 'الأطراف والمالية',
    items: [
      { to: '/customers', label: 'العملاء', icon: Users, permission: 'customers', preload: () => import('@/pages/Customers') },
      { to: '/suppliers', label: 'الموردون', icon: Building2, permission: 'suppliers', preload: () => import('@/pages/Suppliers') },
      { to: '/expenses', label: 'المصروفات', icon: Receipt, permission: 'expenses', preload: () => import('@/pages/Expenses') },
      { to: '/treasury', label: 'الصندوق', icon: Wallet, permission: 'treasury', preload: () => import('@/pages/Treasury') },
    ],
  },
  {
    title: 'الإدارة',
    items: [
      { to: '/reports', label: 'التقارير', icon: BarChart3, permission: 'reports', preload: () => import('@/pages/Reports') },
      { to: '/users', label: 'المستخدمون', icon: UserCog, permission: 'users', preload: () => import('@/pages/Users') },
      { to: '/settings', label: 'الإعدادات', icon: Settings, permission: 'settings', preload: () => import('@/pages/Settings') },
      { to: '/backup', label: 'النسخ الاحتياطي', icon: DatabaseBackup, permission: 'backup', preload: () => import('@/pages/Backup') },
    ],
  },
];

function SidebarContent({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { user, logout, can } = useAuth();
  const { settings } = useSettings();

  return (
    <div className="flex flex-col h-full">
      {/* الشعار */}
      <div className={`flex items-center gap-3 px-4 h-[72px] shrink-0 ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-primary-700 text-white flex items-center justify-center shadow-lg shadow-primary/30 shrink-0">
          <Store size={20} />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-bold text-ink text-sm leading-tight truncate">{settings.storeName}</p>
            <p className="text-[10px] text-ink-mute">نظام إدارة المتجر</p>
          </div>
        )}
      </div>

      {/* القوائم */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">
        {NAV.map((group) => {
          const items = group.items.filter((item) => can(item.permission));
          if (items.length === 0) return null;
          return (
            <div key={group.title}>
              {!collapsed && (
                <p className="text-[10px] font-bold text-ink-mute uppercase tracking-wider px-3 mb-1.5">{group.title}</p>
              )}
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onMouseEnter={() => void item.preload?.()}
                    onFocus={() => void item.preload?.()}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `relative flex items-center gap-3 rounded-xl transition-all duration-150 ${
                        collapsed ? 'justify-center h-11 w-11 mx-auto' : 'h-11 px-3'
                      } ${isActive
                        ? 'bg-primary text-white font-semibold shadow-md shadow-primary/25'
                        : 'text-ink-soft hover:bg-primary-50 hover:text-primary font-medium'}`
                    }
                  >
                    <item.icon size={19} className="shrink-0" />
                    {!collapsed && <span className="text-sm truncate">{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* المستخدم */}
      <div className="p-3 border-t border-line shrink-0">
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-9 h-9 rounded-xl bg-surface-muted flex items-center justify-center text-ink-soft font-bold text-xs shrink-0">
            {user?.role?.nameAr?.slice(0, 1) ?? '؟'}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-ink truncate">{user?.fullName}</p>
              <p className="text-[10px] text-ink-mute truncate">{user?.role?.nameAr}</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={() => void logout()}
              title="تسجيل الخروج"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-mute hover:bg-danger-50 hover:text-danger transition-colors"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
        <button
          onClick={onToggle}
          className={`mt-2 w-full h-8 rounded-lg flex items-center ${collapsed ? 'justify-center' : 'justify-end px-2'} text-ink-mute hover:bg-surface-muted hover:text-ink transition-colors`}
        >
          <ChevronFirst size={15} className={`transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const { settings } = useSettings();

  const isPos = location.pathname === '/pos';

  return (
    <div className="flex h-screen overflow-hidden" dir="rtl">
      {/* الشريط الجانبي (يمين RTL) */}
      <aside
        className={`bg-white border-l border-line shrink-0 transition-all duration-200 ${
          isPos ? 'hidden' : collapsed ? 'w-[72px]' : 'w-[248px]'
        }`}
      >
        <SidebarContent collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </aside>

      {/* المحتوى */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {isPos ? (
          <header className="h-12 shrink-0 bg-white border-b border-line flex items-center justify-between px-4 gap-3 z-10">
            <Link
              to="/"
              className="btn-transition h-9 px-3.5 rounded-xl border border-line bg-white text-ink-soft hover:text-primary hover:border-primary-200 hover:bg-primary-50 transition-colors text-sm font-semibold flex items-center gap-2"
            >
              <ChevronFirst size={16} className="rotate-180" />
              العودة للنظام
            </Link>
            <div className="flex items-center gap-2.5 min-w-0">
              <Badge tone="blue">نقطة البيع</Badge>
              <span className="text-xs text-ink-mute truncate hidden sm:inline">{user?.fullName} — {settings.storeName}</span>
            </div>
          </header>
        ) : (
          <header className="h-[72px] shrink-0 bg-white/80 backdrop-blur border-b border-line flex items-center justify-between px-6 gap-4 z-10">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-success-50 text-success flex items-center justify-center shrink-0">
                <KeyRound size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink truncate">مرحباً، {user?.fullName}</p>
                <p className="text-[11px] text-ink-mute truncate">{settings.storeName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <NavLink
                to="/pos"
                className="h-10 px-4 rounded-xl bg-primary text-white text-sm font-semibold flex items-center gap-2 hover:bg-primary-700 transition-colors shadow-sm shadow-primary/25"
              >
                <ScanBarcode size={17} />
                نقطة البيع
              </NavLink>
            </div>
          </header>
        )}
        <div className="flex-1 overflow-y-auto">
          <div className="page-enter">
            <div className={`p-6 ${isPos ? 'h-full' : 'max-w-[1500px] mx-auto'}`}>
              {children}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
