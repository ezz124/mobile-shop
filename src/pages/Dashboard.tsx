import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShoppingCart, Truck, TrendingUp, Wallet, Package, AlertTriangle,
  Users, Building2, ScanBarcode, Plus, Smartphone, Receipt, UserPlus, Coins,
  ArrowLeft, Boxes, BadgeDollarSign,
} from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { money, formatDate, num } from '@/lib/format';
import { useSettings } from '@/store/settings';
import { useAuth } from '@/store/auth';
import { StatCard, Card, EmptyState, Spinner, Badge } from '@/components/ui/primitives';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { shortDayLabel } from '@/lib/format';
import type { DashboardData } from '@/shared/ipc';

const QUICK_ACTIONS = [
  { to: '/pos', label: 'بيع جديد', icon: ScanBarcode, permission: 'pos', color: 'bg-primary text-white' },
  { to: '/phones', label: 'إضافة هاتف', icon: Smartphone, permission: 'phones', color: 'bg-white text-primary border border-primary-100' },
  { to: '/products', label: 'إضافة منتج', icon: Plus, permission: 'products', color: 'bg-white text-primary border border-primary-100' },
  { to: '/purchases', label: 'فاتورة شراء', icon: Truck, permission: 'purchases', color: 'bg-white text-primary border border-primary-100' },
  { to: '/customers', label: 'عميل جديد', icon: UserPlus, permission: 'customers', color: 'bg-white text-primary border border-primary-100' },
  { to: '/suppliers', label: 'مورد جديد', icon: Users, permission: 'suppliers', color: 'bg-white text-primary border border-primary-100' },
  { to: '/expenses', label: 'مصروف', icon: Receipt, permission: 'expenses', color: 'bg-white text-warning border border-warning-100' },
] as const;

export default function Dashboard() {
  const { currency } = useSettings();
  const { can } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => invoke('reports:dashboard', {}),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <Spinner size={30} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-8">
        <EmptyState
          icon={<Package size={26} />}
          title="تعذر تحميل لوحة التحكم"
          description={error instanceof Error ? error.message : 'حدث خطأ غير متوقع'}
        />
      </Card>
    );
  }

  const d: DashboardData = data;
  const chartData = d.salesChart.map((p) => ({ ...p, label: shortDayLabel(p.date) }));

  return (
    <div className="space-y-6">
      {/* إجراءات سريعة */}
      <div className="flex items-center gap-2.5 flex-wrap">
        {QUICK_ACTIONS.filter((a) => can(a.permission)).map((action) => (
          <Link
            key={action.to + action.label}
            to={action.to}
            className={`btn-transition h-11 px-4 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-sm hover:shadow-md ${action.color}`}
          >
            <action.icon size={17} />
            {action.label}
          </Link>
        ))}
      </div>

      {/* البطاقات الإحصائية */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="مبيعات اليوم" value={money(d.todaySales, currency)} sub={`${d.todaySalesCount} فاتورة اليوم`} icon={<ShoppingCart size={22} />} tone="blue" delay={0} />
        <StatCard title="أرباح اليوم" value={money(d.todayProfit, currency)} sub={`ربح الشهر: ${money(d.monthProfit, currency)}`} icon={<TrendingUp size={22} />} tone="green" delay={0.05} />
        <StatCard title="رصيد الصندوق" value={money(d.cashBalance, currency)} icon={<Wallet size={22} />} tone={(d.cashBalance >= 0 ? 'blue' : 'red') as 'blue' | 'red'} delay={0.1} />
        <StatCard title="مشتريات اليوم" value={money(d.todayPurchases, currency)} icon={<Truck size={22} />} tone="gray" delay={0.15} />
        <StatCard title="إجمالي المنتجات" value={num(d.totalProducts)} sub={`${num(d.totalUnits)} قطعة بالمخزون`} icon={<Package size={22} />} tone="blue" delay={0.2} />
        <StatCard title="منتجات تحت الحد الأدنى" value={num(d.lowStockCount)} sub="بحاجة إعادة تعبئة" icon={<AlertTriangle size={22} />} tone={d.lowStockCount > 0 ? 'amber' : 'gray'} delay={0.25} onClick={() => navigate('/inventory')} />
        <StatCard title="ديون العملاء" value={money(d.customersDebt, currency)} icon={<Users size={22} />} tone={d.customersDebt > 0 ? 'amber' : 'gray'} delay={0.3} onClick={() => navigate('/customers')} />
        <StatCard title="ذمم الموردين" value={money(d.suppliersDebt, currency)} icon={<Building2 size={22} />} tone={d.suppliersDebt > 0 ? 'red' : 'gray'} delay={0.35} onClick={() => navigate('/suppliers')} />
      </div>

      {/* المخطط + الأكثر مبيعاً */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-ink">حركة المبيعات والأرباح</h3>
              <p className="text-xs text-ink-mute mt-0.5">آخر 14 يوماً — مبيعات الشهر: {money(d.monthSales, currency)}</p>
            </div>
            <Badge tone="green">ربح الشهر: {money(d.monthProfit, currency)}</Badge>
          </div>
          <div className="h-[260px]" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16A34A" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#16A34A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={45} tickFormatter={(v: number) => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)} />
                <Tooltip
                  formatter={(value: number, name: string) => [money(value, currency), name === 'total' ? 'المبيعات' : 'الأرباح']}
                  labelStyle={{ fontFamily: 'Rubik', direction: 'rtl' }}
                  contentStyle={{ fontFamily: 'Rubik', borderRadius: 14, border: '1px solid #E5E7EB', fontSize: 12, direction: 'rtl' }}
                />
                <Area type="monotone" dataKey="total" stroke="#2563EB" strokeWidth={2.2} fill="url(#salesFill)" />
                <Area type="monotone" dataKey="profit" stroke="#16A34A" strokeWidth={2.2} fill="url(#profitFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-xl bg-success-50 text-success flex items-center justify-center">
              <BadgeDollarSign size={18} />
            </div>
            <div>
              <h3 className="font-bold text-ink text-sm">الأكثر مبيعاً</h3>
              <p className="text-[11px] text-ink-mute">حسب الكمية المبيعة</p>
            </div>
          </div>
          {d.bestSellers.length === 0 ? (
            <EmptyState icon={<Boxes size={24} />} title="لا توجد مبيعات بعد" description="ستظهر المنتجات الأكثر مبيعاً هنا بعد أول عملية بيع" />
          ) : (
            <div className="space-y-1">
              {d.bestSellers.map((p, i) => (
                <div key={p.productId} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-subtle transition-colors">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? 'bg-success text-white' : 'bg-surface-muted text-ink-soft'}`}>
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink truncate">{p.name}</p>
                    <p className="text-[11px] text-ink-mute">{num(p.quantity)} قطعة — {money(p.revenue, currency)}</p>
                  </div>
                  <Badge tone="green">{money(p.profit, currency)}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* أحدث العمليات */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-ink text-sm">أحدث المبيعات</h3>
            <Link to="/sales" className="text-xs font-semibold text-primary hover:text-primary-700 flex items-center gap-1 transition-colors">
              عرض الكل <ArrowLeft size={13} />
            </Link>
          </div>
          {d.recentSales.length === 0 ? (
            <EmptyState icon={<Coins size={24} />} title="لا توجد مبيعات" description="ابدأ أول عملية بيع من نقطة البيع" action={<Link to="/pos" className="h-10 px-4 rounded-xl bg-primary text-white text-sm font-semibold flex items-center gap-2"><ScanBarcode size={16} /> فتح نقطة البيع</Link>} />
          ) : (
            <div className="space-y-1">
              {d.recentSales.map((s) => (
                <Link key={s.id} to={`/sales?focus=${s.id}`} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-subtle transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary flex items-center justify-center shrink-0">
                    <ShoppingCart size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink truncate" dir="ltr">{s.invoiceNumber}</p>
                    <p className="text-[11px] text-ink-mute">{s.customer?.name ?? 'زبون نقدي'} • {formatDate(s.createdAt)}</p>
                  </div>
                  <p className="text-sm font-bold text-success shrink-0" dir="ltr">{money(s.total - s.returnedAmount, currency)}</p>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-ink text-sm">أحدث المشتريات</h3>
            <Link to="/purchases" className="text-xs font-semibold text-primary hover:text-primary-700 flex items-center gap-1 transition-colors">
              عرض الكل <ArrowLeft size={13} />
            </Link>
          </div>
          {d.recentPurchases.length === 0 ? (
            <EmptyState icon={<Truck size={24} />} title="لا توجد مشتريات" description="سجّل أول فاتورة شراء لتحديث المخزون" />
          ) : (
            <div className="space-y-1">
              {d.recentPurchases.map((p) => (
                <Link key={p.id} to={`/purchases?focus=${p.id}`} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-subtle transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-surface-muted text-ink-soft flex items-center justify-center shrink-0">
                    <Truck size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink truncate" dir="ltr">{p.invoiceNumber}</p>
                    <p className="text-[11px] text-ink-mute truncate">{p.supplier?.name ?? '—'} • {formatDate(p.createdAt)}</p>
                  </div>
                  <p className="text-sm font-bold text-ink shrink-0" dir="ltr">{money(p.total - p.returnedAmount, currency)}</p>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
