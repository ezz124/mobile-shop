import type { ApiChannel, ApiMap, IpcResult } from '@/shared/ipc';

export class ApiError extends Error {}

export const SESSION_EXPIRED_EVENT = 'mbile:session-expired';

/** استدعاء آمن ومُوحّد لقنوات IPC — يرفع أخطاء عربية جاهزة للعرض */
export async function invoke<C extends ApiChannel>(
  channel: C,
  args?: ApiMap[C]['req']
): Promise<ApiMap[C]['res']> {
  if (channel === 'print:html') {
    const printArgs = args as { html: string; title?: string };
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(printArgs.html);
      printWindow.document.close();
      printWindow.document.title = printArgs.title ?? 'طباعة';
      // انتظر تحميل المحتوى الكامل قبل الطباعة
      const doPrint = () => {
        printWindow.focus();
        printWindow.print();
      };
      if (printWindow.document.readyState === 'complete') {
        doPrint();
      } else {
        printWindow.addEventListener('load', doPrint, { once: true });
      }
    }
    return { ok: true } as ApiMap[C]['res'];
  }
  let res: IpcResult<ApiMap[C]['res']>;
  try {
    const base = import.meta.env.VITE_API_URL || '';
    const response = await fetch(`${base}/api/invoke/${encodeURIComponent(channel)}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args ?? {}),
    });
    res = await response.json() as IpcResult<ApiMap[C]['res']>;
  } catch (e) {
    throw new ApiError('تعذر الاتصال بخدمات النظام — أعد تشغيل التطبيق');
  }
  if (!res.ok) {
    if (res.error.includes('انتهت الجلسة')) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(res.error);
  }
  return res.data;
}
