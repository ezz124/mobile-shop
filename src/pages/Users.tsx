import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users as UsersIcon, UserPlus, Pencil, Trash2, KeyRound } from 'lucide-react';
import { invoke } from '@/lib/ipc';
import { formatDateTime, initials, num } from '@/lib/format';
import { useToast } from '@/store/toast';
import {
  Button, PageHeader, Badge, Card, FormField, Switch, Tabs, EmptyState, Spinner,
} from '@/components/ui/primitives';
import { SearchInput, Input, Select } from '@/components/ui/inputs';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { PERMISSIONS, PERMISSION_LABELS, type RoleDTO, type UserDTO, type PermissionKey } from '@/shared/ipc';

type UsersTab = 'users' | 'roles';

const USERS_TABS: { value: UsersTab; label: string }[] = [
  { value: 'users', label: 'المستخدمون' },
  { value: 'roles', label: 'الأدوار والصلاحيات' },
];

interface UserForm {
  id?: number;
  username: string;
  fullName: string;
  password: string;
  phone: string;
  roleId: number | '';
  isActive: boolean;
}

type UserFormErrors = Partial<Record<'username' | 'fullName' | 'password' | 'roleId', string>>;

const EMPTY_USER: UserForm = { username: '', fullName: '', password: '', phone: '', roleId: '', isActive: true };

function validateUserForm(form: UserForm): UserFormErrors {
  const errs: UserFormErrors = {};
  if (form.id == null) {
    if (form.username.trim().length < 3) errs.username = 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل';
    if (form.password.length < 6) errs.password = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
  }
  if (!form.fullName.trim()) errs.fullName = 'الاسم الكامل مطلوب';
  if (form.roleId === '') errs.roleId = 'اختر دوراً للمستخدم';
  return errs;
}

let searchTimer: ReturnType<typeof setTimeout>;

export default function Users() {
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<UsersTab>('users');

  // ── قائمة المستخدمين ──
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['users', debounced, page],
    queryFn: () => invoke('users:list', { search: debounced || undefined, page, pageSize: 15 }),
    placeholderData: (prev) => prev,
  });

  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => invoke('roles:list', {}),
  });

  // ── نموذج الإضافة/التعديل ──
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserForm>(EMPTY_USER);
  const [errors, setErrors] = useState<UserFormErrors>({});

  const saveMutation = useMutation({
    mutationFn: (form: UserForm) =>
      form.id != null
        ? invoke('users:update', {
            id: form.id,
            fullName: form.fullName.trim(),
            phone: form.phone.trim() || undefined,
            roleId: form.roleId as number,
            isActive: form.isActive,
          })
        : invoke('users:create', {
            username: form.username.trim(),
            fullName: form.fullName.trim(),
            password: form.password,
            phone: form.phone.trim() || undefined,
            roleId: form.roleId as number,
            isActive: form.isActive,
          }),
    onSuccess: (_res, form) => {
      success(form.id != null ? 'تم تحديث بيانات المستخدم' : 'تمت إضافة المستخدم بنجاح');
      setFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر حفظ المستخدم'),
  });

  function submitUser(): void {
    const errs = validateUserForm(editing);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    saveMutation.mutate(editing);
  }

  // ── إعادة تعيين كلمة المرور ──
  const [resetting, setResetting] = useState<UserDTO | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const resetMutation = useMutation({
    mutationFn: (v: { id: number; newPassword: string }) => invoke('users:resetPassword', v),
    onSuccess: () => {
      success('تم تعيين كلمة المرور الجديدة');
      setResetting(null);
      setNewPassword('');
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر تعيين كلمة المرور'),
  });

  // ── حذف مستخدم ──
  const [deleting, setDeleting] = useState<UserDTO | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => invoke('users:delete', { id }),
    onSuccess: () => {
      success('تم حذف المستخدم');
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر حذف المستخدم'),
  });

  // ── صلاحيات الأدوار ──
  const [permOverrides, setPermOverrides] = useState<Record<number, string[]>>({});

  const savePermsMutation = useMutation({
    mutationFn: (v: { roleId: number; permissionKeys: string[] }) => invoke('roles:updatePermissions', v),
    onSuccess: (role) => {
      success(`تم حفظ صلاحيات «${role.nameAr}»`);
      setPermOverrides((prev) => {
        const next = { ...prev };
        delete next[role.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (e) => toastError(e instanceof Error ? e.message : 'تعذر حفظ الصلاحيات'),
  });

  function togglePermission(roleId: number, current: string[], key: PermissionKey): void {
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    setPermOverrides((prev) => ({ ...prev, [roleId]: next }));
  }

  const userColumns: Column<UserDTO>[] = [
    {
      key: 'user',
      header: 'المستخدم',
      render: (u) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary-50 text-primary flex items-center justify-center shrink-0 text-xs font-bold">
            {initials(u.fullName)}
          </div>
          <div>
            <p className="font-semibold">{u.fullName}</p>
            <p className="text-[11px] text-ink-mute" dir="ltr">{u.username}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'الدور',
      render: (u) => (u.role ? <Badge tone="blue">{u.role.nameAr}</Badge> : <span className="text-ink-mute">—</span>),
    },
    {
      key: 'phone',
      header: 'الهاتف',
      render: (u) => (u.phone ? <span dir="ltr" className="text-ink-soft">{u.phone}</span> : <span className="text-ink-mute">—</span>),
      hideOn: 'hidden md:table-cell',
    },
    {
      key: 'lastLogin',
      header: 'آخر دخول',
      render: (u) => <span className="text-ink-soft">{formatDateTime(u.lastLoginAt)}</span>,
      hideOn: 'hidden lg:table-cell',
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (u) => (u.isActive ? <Badge tone="green">مفعّل</Badge> : <Badge tone="red">معطّل</Badge>),
    },
    {
      key: 'actions',
      header: 'إجراءات',
      align: 'center',
      render: (u) => (
        <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              setEditing({ id: u.id, username: u.username, fullName: u.fullName, password: '', phone: u.phone ?? '', roleId: u.roleId, isActive: u.isActive });
              setErrors({});
              setFormOpen(true);
            }}
            className="w-8 h-8 rounded-lg text-ink-soft hover:bg-primary-50 hover:text-primary transition-colors"
            title="تعديل"
          >
            <Pencil size={15} className="mx-auto" />
          </button>
          <button
            onClick={() => { setResetting(u); setNewPassword(''); }}
            className="w-8 h-8 rounded-lg text-ink-soft hover:bg-primary-50 hover:text-primary transition-colors"
            title="إعادة تعيين كلمة المرور"
          >
            <KeyRound size={15} className="mx-auto" />
          </button>
          <button
            onClick={() => setDeleting(u)}
            className="w-8 h-8 rounded-lg text-ink-soft hover:bg-danger-50 hover:text-danger transition-colors"
            title="حذف"
          >
            <Trash2 size={15} className="mx-auto" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <Tabs tabs={USERS_TABS} value={tab} onChange={setTab} />

      {tab === 'users' && (
        <>
          <PageHeader
            title="المستخدمون"
            subtitle="إدارة حسابات العاملين وأدوارهم وصلاحياتهم"
            actions={
              <Button
                icon={<UserPlus size={17} />}
                onClick={() => {
                  setEditing({ ...EMPTY_USER, roleId: roles?.[0]?.id ?? '' });
                  setErrors({});
                  setFormOpen(true);
                }}
              >
                مستخدم جديد
              </Button>
            }
          />

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                clearTimeout(searchTimer);
                searchTimer = setTimeout(() => { setDebounced(v); setPage(1); }, 250);
              }}
              placeholder="ابحث بالاسم أو اسم المستخدم…"
              className="w-80"
            />
          </div>

          <DataTable
            columns={userColumns}
            rows={usersData?.data ?? []}
            loading={usersLoading}
            empty={<EmptyState icon={<UsersIcon size={26} />} title="لا يوجد مستخدمون" description="أضف أول مستخدم لمنح صلاحية الدخول إلى النظام" />}
          />

          <Pagination page={page} pageSize={usersData?.pageSize ?? 15} total={usersData?.total ?? 0} onChange={setPage} />

          {/* نموذج الإضافة/التعديل */}
          <Modal
            open={formOpen}
            onClose={() => setFormOpen(false)}
            title={editing.id != null ? 'تعديل المستخدم' : 'إضافة مستخدم جديد'}
            footer={
              <>
                <Button variant="ghost" onClick={() => setFormOpen(false)}>إلغاء</Button>
                <Button loading={saveMutation.isPending} disabled={!editing.fullName.trim()} onClick={submitUser}>
                  {editing.id != null ? 'حفظ التعديلات' : 'إضافة المستخدم'}
                </Button>
              </>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {editing.id == null && (
                <FormField label="اسم المستخدم" required error={errors.username}>
                  <Input
                    value={editing.username}
                    onChange={(e) => setEditing({ ...editing, username: e.target.value })}
                    placeholder="username"
                    dir="ltr"
                    className="text-left"
                  />
                </FormField>
              )}
              <FormField label="الاسم الكامل" required error={errors.fullName}>
                <Input
                  value={editing.fullName}
                  onChange={(e) => setEditing({ ...editing, fullName: e.target.value })}
                  placeholder="الاسم الكامل"
                />
              </FormField>
              {editing.id == null && (
                <FormField label="كلمة المرور" required error={errors.password} hint="6 أحرف على الأقل">
                  <Input
                    type="password"
                    value={editing.password}
                    onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                    placeholder="••••••"
                    dir="ltr"
                    className="text-left"
                  />
                </FormField>
              )}
              <FormField label="رقم الهاتف">
                <Input
                  value={editing.phone}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  placeholder="01xxxxxxxxx"
                  dir="ltr"
                  className="text-left"
                />
              </FormField>
              <FormField label="الدور" required error={errors.roleId}>
                <Select
                  value={editing.roleId === '' ? '' : String(editing.roleId)}
                  onChange={(e) => setEditing({ ...editing, roleId: e.target.value ? Number(e.target.value) : '' })}
                >
                  <option value="">اختر الدور…</option>
                  {(roles ?? []).map((r) => (
                    <option key={r.id} value={r.id}>{r.nameAr}</option>
                  ))}
                </Select>
              </FormField>
              {editing.id != null && (
                <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3 sm:col-span-2">
                  <div>
                    <p className="text-sm font-semibold text-ink">الحساب مفعّل</p>
                    <p className="text-[11px] text-ink-mute">تعطيل الحساب يمنع صاحبه من الدخول إلى النظام</p>
                  </div>
                  <Switch checked={editing.isActive} onChange={(v) => setEditing({ ...editing, isActive: v })} />
                </div>
              )}
            </div>
          </Modal>

          {/* إعادة تعيين كلمة المرور */}
          <Modal
            open={resetting != null}
            onClose={() => { setResetting(null); setNewPassword(''); }}
            title="إعادة تعيين كلمة المرور"
            subtitle={resetting?.fullName}
            size="sm"
            footer={
              <>
                <Button variant="ghost" onClick={() => { setResetting(null); setNewPassword(''); }}>إلغاء</Button>
                <Button
                  loading={resetMutation.isPending}
                  disabled={newPassword.trim().length < 6}
                  onClick={() => resetting && resetMutation.mutate({ id: resetting.id, newPassword: newPassword.trim() })}
                >
                  تعيين كلمة المرور
                </Button>
              </>
            }
          >
            <FormField label="كلمة المرور الجديدة" required hint="6 أحرف على الأقل">
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••"
                dir="ltr"
                className="text-left"
                invalid={newPassword.length > 0 && newPassword.trim().length < 6}
              />
            </FormField>
          </Modal>

          <ConfirmDialog
            open={deleting != null}
            onClose={() => setDeleting(null)}
            onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
            title="حذف المستخدم"
            message={`هل أنت متأكد من حذف المستخدم «${deleting?.fullName ?? ''}»؟ سيتم إلغاء وصوله إلى النظام فوراً.`}
            confirmLabel="حذف"
            danger
            loading={deleteMutation.isPending}
          />
        </>
      )}

      {tab === 'roles' && (
        <>
          <PageHeader
            title="الأدوار والصلاحيات"
            subtitle="اضغط على الصلاحيات لتفعيلها أو تعطيلها لكل دور ثم احفظ التغييرات"
          />

          {rolesLoading ? (
            <div className="flex items-center justify-center py-24"><Spinner size={28} /></div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {(roles ?? []).map((role: RoleDTO) => {
                const isAdmin = role.key === 'admin';
                const selected = permOverrides[role.id] ?? role.permissions;
                return (
                  <Card key={role.id} className="p-5 flex flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-ink">{role.nameAr}</h3>
                        {role.description && <p className="text-xs text-ink-mute mt-0.5">{role.description}</p>}
                      </div>
                      <Badge tone="blue">{num(role.userCount ?? 0)} مستخدم</Badge>
                    </div>

                    <div className="flex flex-wrap gap-1.5 my-4 flex-1">
                      {PERMISSIONS.map((p) => {
                        const active = selected.includes(p);
                        return (
                          <button
                            key={p}
                            type="button"
                            disabled={isAdmin}
                            onClick={() => togglePermission(role.id, selected, p)}
                            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                              active
                                ? 'bg-primary text-white border-primary'
                                : 'bg-surface-muted text-ink-soft border-line hover:border-primary-100 hover:text-ink'
                            }`}
                          >
                            {PERMISSION_LABELS[p]}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
                      <p className="text-[11px] text-ink-mute">
                        {isAdmin ? 'لا يمكن تعديل صلاحيات مدير النظام' : `${num(selected.length)} صلاحية مفعّلة`}
                      </p>
                      <Button
                        size="sm"
                        disabled={isAdmin}
                        loading={savePermsMutation.isPending && savePermsMutation.variables?.roleId === role.id}
                        onClick={() => savePermsMutation.mutate({ roleId: role.id, permissionKeys: selected })}
                      >
                        حفظ الصلاحيات
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
