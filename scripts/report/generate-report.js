// توليد التقرير التعريفي — نظام إدارة متاجر الهواتف النقّالة (Mbile ERP)
// مستند Word عربي RTL كامل بتصميم احترافي
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, Header, Footer,
  AlignmentType, HeadingLevel, PageNumber, BorderStyle, WidthType, ShadingType,
  TableLayoutType, SectionType, VerticalAlign, PageBreak, TableOfContents,
} = require('docx');
const fs = require('fs');
const path = require('path');

// ─────────────────────────── الهوية البصرية ───────────────────────────
const BRAND = {
  primary: '2563EB',      // أزرق العلامة
  primaryDark: '1E3A8A',
  green: '16A34A',
  ink: '1F2937',
  soft: '4B5563',
  mute: '9CA3AF',
  line: 'E5E7EB',
  subtleBg: 'F6F7F9',
  coverBg: '1E3A8A',
  accent: '4ADE80',
};

const PALETTE = {
  bg: BRAND.coverBg,
  titleColor: 'FFFFFF',
  subtitleColor: 'C7D2FE',
  metaColor: 'E0E7FF',
  accent: BRAND.accent,
  footerColor: '93A5E8',
};

const AR_FONT = { ascii: 'Arial', hAnsi: 'Arial', cs: 'Arial', eastAsia: 'Arial' };

// ─────────────────────────── أدوات الغلاف (R1 معكوس RTL) ───────────────────────────

const noBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};
const allNoBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

// عرض الحرف العربي ≈ pt × 12.5 twips (أضيق من الصينية)
function calcTitleLayoutAr(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charWidth = (pt) => pt * 12.5;
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt;
  let lines = [title];
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    lines = splitArabicLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (lines.length > 3) { lines = splitArabicLines(title, charsPerLine(minPt)); titlePt = minPt; }
  return { titlePt, titleLines: lines };
}

// كسر الأسطر عند المسافات فقط (حدود دلالية)
function splitArabicLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const words = title.split(' ');
  const lines = [];
  let current = '';
  for (const w of words) {
    const candidate = current ? current + ' ' + w : w;
    if (candidate.length > charsPerLine && current) { lines.push(current); current = w; }
    else current = candidate;
  }
  if (current) lines.push(current);
  if (lines.length > 1 && lines[lines.length - 1].length <= 4) {
    const last = lines.pop();
    lines[lines.length - 1] += ' ' + last;
  }
  return lines;
}

function calcCoverSpacing(params) {
  const {
    titleLineCount = 1, titlePt = 36, hasSubtitle = false,
    hasEnglishLabel = false, metaLineCount = 0,
    fixedHeight = 800, pageHeight = 16838,
    marginTop = 0, marginBottom = 0,
  } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const remainingSpace = usableHeight - contentHeight;
  const safeRemaining = Math.max(remainingSpace, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

// وصفة R1 — معكوسة للعربية (نص من اليمين، شريط تمييز على اليمين)
function buildCoverR1RTL(config) {
  const P = config.palette;
  const padStart = 1200, padEnd = 800;
  const availableWidth = 11906 - padStart - padEnd - 300;
  const { titlePt, titleLines } = calcTitleLayoutAr(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;

  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length,
    fixedHeight: 400,
  });

  const accentRight = { style: BorderStyle.SINGLE, size: 8, color: P.accent, space: 12 };
  const children = [];

  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));

  if (config.englishLabel) {
    children.push(new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.START,
      indent: { start: padEnd, end: padStart },
      spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent, space: 8 } },
      children: [new TextRun({
        text: config.englishLabel.split('').join('  '),
        size: 18, color: P.accent, font: AR_FONT, characterSpacing: 40,
      })],
    }));
  }

  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.START,
      indent: { end: padStart },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: 'atLeast' },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true, color: P.titleColor, font: AR_FONT, rightToLeft: true })],
    }));
  }

  if (config.subtitle) {
    children.push(new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.START,
      indent: { end: padStart },
      spacing: { after: 800 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: P.subtitleColor, font: AR_FONT, rightToLeft: true })],
    }));
  }

  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.START,
      indent: { end: padStart + 200 },
      spacing: { after: 80 },
      border: { right: accentRight },
      children: [new TextRun({ text: line, size: 24, color: P.metaColor, font: AR_FONT, rightToLeft: true })],
    }));
  }

  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));

  children.push(new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.START,
    indent: { start: padEnd, end: padStart },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerRight || '', size: 16, color: P.footerColor, font: AR_FONT, rightToLeft: true }),
      new TextRun({ text: '                                        ', font: AR_FONT }),
      new TextRun({ text: config.footerLeft || '', size: 16, color: P.footerColor, font: AR_FONT }),
    ],
  }));

  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    visuallyRightToLeft: true,
    rows: [new TableRow({
      height: { value: 16838, rule: 'exact' },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: P.bg },
        borders: noBorders,
        children,
      })],
    })],
  })];
}

// ─────────────────────────── مكونات المحتوى ───────────────────────────

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    bidirectional: true,
    alignment: AlignmentType.START,
    spacing: { before: 400, after: 160, line: 312 },
    keepNext: true,
    children: [new TextRun({ text, bold: true, size: 32, color: BRAND.primaryDark, font: AR_FONT, rightToLeft: true })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    bidirectional: true,
    alignment: AlignmentType.START,
    spacing: { before: 280, after: 120, line: 312 },
    keepNext: true,
    children: [new TextRun({ text, bold: true, size: 26, color: BRAND.primary, font: AR_FONT, rightToLeft: true })],
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 120, line: 312 },
    children: [new TextRun({ text, size: 22, color: BRAND.ink, font: AR_FONT, rightToLeft: true, bold: opts.bold })],
  });
}

function bullet(text, opts = {}) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.START,
    indent: { start: 280, hanging: 280 },
    spacing: { after: 90, line: 312 },
    children: [
      new TextRun({ text: '\u2022  ', size: 22, color: BRAND.green, bold: true, font: AR_FONT, rightToLeft: true }),
      new TextRun({ text, size: 22, color: BRAND.ink, font: AR_FONT, rightToLeft: true, bold: opts.bold }),
    ],
  });
}

function checkItem(text) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.START,
    indent: { start: 280, hanging: 280 },
    spacing: { after: 100, line: 312 },
    children: [
      new TextRun({ text: '\u2713  ', size: 22, color: BRAND.green, bold: true, font: AR_FONT }),
      new TextRun({ text, size: 22, color: BRAND.ink, font: AR_FONT, rightToLeft: true }),
    ],
  });
}

const CELL_MARGINS = { top: 120, bottom: 120, left: 160, right: 160 };

function headerCell(text, widthPct) {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, fill: BRAND.primaryDark },
    verticalAlign: VerticalAlign.CENTER,
    margins: CELL_MARGINS,
    width: widthPct ? { size: widthPct, type: WidthType.PERCENTAGE } : undefined,
    children: [new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.START,
      spacing: { line: 280 },
      children: [new TextRun({ text, bold: true, size: 21, color: 'FFFFFF', font: AR_FONT, rightToLeft: true })],
    })],
  });
}

function dataCell(text, opts = {}) {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, fill: opts.zebra ? BRAND.subtleBg : 'FFFFFF' },
    verticalAlign: VerticalAlign.CENTER,
    margins: CELL_MARGINS,
    children: [new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.START,
      spacing: { line: 280 },
      children: [new TextRun({ text, size: 21, color: opts.strong ? BRAND.primaryDark : BRAND.ink, bold: opts.strong, font: AR_FONT, rightToLeft: true })],
    })],
  });
}

function featureTable(headers, rows, widths) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    visuallyRightToLeft: true,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: BRAND.line },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND.line },
      left: { style: BorderStyle.SINGLE, size: 4, color: BRAND.line },
      right: { style: BorderStyle.SINGLE, size: 4, color: BRAND.line },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: BRAND.line },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: BRAND.line },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: headers.map((htext, i) => headerCell(htext, widths ? widths[i] : undefined)),
      }),
      ...rows.map((row, ri) => new TableRow({
        cantSplit: true,
        children: row.map((cell, ci) => dataCell(cell, { zebra: ri % 2 === 1, strong: ci === 0 })),
      })),
    ],
  });
}

function tableCaption(text) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.START,
    keepNext: true,
    spacing: { before: 160, after: 100 },
    children: [new TextRun({ text, size: 20, bold: true, color: BRAND.soft, font: AR_FONT, rightToLeft: true })],
  });
}

function spacer(h = 120) {
  return new Paragraph({ spacing: { after: h }, children: [] });
}

// ─────────────────────────── المحتوى ───────────────────────────

const coverConfig = {
  title: 'نظام إدارة متاجر الهواتف النقّالة',
  subtitle: 'إدارة متجرك بكل سهولة واحترافية — بيع ومخزون وحسابات وتقارير في نظام واحد متكامل',
  englishLabel: 'MBILE ERP SYSTEM REPORT',
  metaLines: [
    'نظام سطح مكتب متكامل — 18 وحدة إدارية',
    'واجهة عربية كاملة — العملة: الجنيه المصري',
    'يعمل بدون اتصال بالإنترنت — بياناتك محلية وآمنة',
  ],
  footerRight: 'Mbile ERP — تقرير تعريفي شامل',
  footerLeft: '2026',
  palette: PALETTE,
};

const bodyChildren = [];

// ═══ 1. نظرة عامة ═══
bodyChildren.push(h1('1. نظرة عامة على النظام'));
bodyChildren.push(body('نظام إدارة متاجر الهواتف النقّالة (Mbile ERP) هو نظام متكامل لإدارة محلات الهواتف والملحقات، يساعدك على تنظيم المبيعات والمشتريات والمخزون والحسابات من خلال واجهة عربية سهلة وسريعة، مصممة خصيصاً لطبيعة عمل متاجر الهواتف — من تتبع كل جهاز برقم الـ IMEI حتى معرفة ربحك الصافي من كل عملية بيع.'));
bodyChildren.push(body('النظام يعمل كتطبيق سطح مكتب كامل على جهازك مباشرة وبدون أي اتصال بالإنترنت، وتُحفظ جميع بياناتك محلياً بقاعدة بيانات محمية، مما يضمن سرعة الاستجابة وخصوصية تامة لبيانات متجرك.'));

// ═══ 2. المميزات الرئيسية ═══
bodyChildren.push(h1('2. المميزات الرئيسية'));
[
  'نقطة بيع (POS) فورية: بحث بالاسم أو الباركود أو رقم IMEI مع دعم قارئ الباركود مباشرة.',
  'تتبع فردي لكل جهاز هاتف برقم الـ IMEI أو الرقم التسلسلي من لحظة الشراء حتى البيع أو الإرجاع.',
  'إدارة كاملة للمبيعات والمشتريات بفواتير مرقّمة تلقائياً ودعم البيع نقدياً أو بالدين أو بدفعة جزئية.',
  'إدارة المنتجات والملحقات بكميات وحد أدنى للمخزون وتنبيهات فورية عند نقص أي منتج.',
  'إدارة العملاء والموردين مع متابعة الديون والذمم وكشوف حساب تفصيلية وسداد الدفعات.',
  'صندوق (خزينة) ذكي يسجل كل حركة مالية تلقائياً — دخل وصادر — برصيد لحظي محدّث.',
  'إدارة المصروفات بتصنيفات جاهزة تُخصم من الصندوق فور تسجيلها.',
  'مرتجعات مبيعات ومشتريات — كلي أو جزئي — تعكس المخزون والحسابات تلقائياً.',
  'طباعة فواتير احترافية على طابعة حرارية 80مم أو ورق A4 باسم متجرك.',
  'تقارير وإحصائيات لحظية: المبيعات، الأرباح، أفضل المنتجات، أداء الموظفين، الديون، الصندوق، المخزون.',
  'مستخدمون متعددون بصلاحيات دقيقة (5 أدوار جاهزة) وسجل تدقيق لكل عملية.',
  'نسخ احتياطي يدوي وتلقائي مع فحص سلامة واستعادة آمنة بنقرة واحدة.',
].forEach((f) => bodyChildren.push(checkItem(f)));

// ═══ 3. وحدات النظام ═══
bodyChildren.push(h1('3. وحدات النظام الثمانية عشرة'));
bodyChildren.push(body('يضم النظام 18 وحدة متكاملة تعمل معاً بانسجام على نفس قاعدة البيانات، بحيث تنعكس كل عملية فوراً على كل ما يخصها: المخزون والصندوق والديون والتقارير.'));
bodyChildren.push(tableCaption('جدول 1: وحدات النظام ووظائفها الرئيسية'));
bodyChildren.push(featureTable(
  ['الوحدة', 'الوظيفة الرئيسية'],
  [
    ['لوحة التحكم', 'ملخص لحظي للمبيعات والأرباح والرصيد والديون مع مخططات بيانية وإجراءات سريعة'],
    ['نقطة البيع POS', 'شاشة بيع سريعة للكاشير: بحث وباركود وIMEI وسلة ودفع جزئي وطباعة'],
    ['المنتجات', 'إدارة كل منتجات المتجر (هواتف وملحقات) بأسعار وكميات وتصنيفات وماركات'],
    ['الهواتف', 'تتبع الأجهزة فردياً برقم IMEI وحالتها (متوفر / مبيع / مرتجع / تالف)'],
    ['الملحقات', 'إدارة الشواحن والسماعات والحمايات وغيرها بكميات مجمعة'],
    ['المخزون', 'حركات المخزون الكاملة، الجرد والتعديل والتالف، وتقييم المخزون وتنبيهات النقص'],
    ['المبيعات', 'سجل الفواتير بالكامل مع التفاصيل والتحصيلات والأرباح وربط المرتجعات'],
    ['المشتريات', 'فواتير الشراء من الموردين مع تسجيل أجهزة الـ IMEI الجديدة تلقائياً'],
    ['المرتجعات', 'إرجاع كلي أو جزئي للمبيعات والمشتريات مع عكس كل الآثار المالية والمخزنية'],
    ['الفواتير', 'استعراض وطباعة كل فواتير البيع والشراء'],
    ['العملاء', 'بيانات العملاء وديونهم وكشوف حسابهم وسداد ديونهم'],
    ['الموردون', 'بيانات الموردين وذممهم وسداد مستحقاتهم'],
    ['المصروفات', 'تسجيل مصروفات المتجر بتصنيفات مع خصمها الفوري من الصندوق'],
    ['الصندوق', 'دفتر مالي كامل لكل حركات النقد: وارد وصادر برصيد لحظي'],
    ['التقارير', '7 تقارير تحليلية بمدى زمني مرن مع طباعة'],
    ['المستخدمون', 'إدارة المستخدمين والأدوار والصلاحيات الدقيقة'],
    ['الإعدادات', 'بيانات المتجر والفواتير والطباعة والمخزون والأمان'],
    ['النسخ الاحتياطي', 'إنشاء واستعادة نسخ احتياطية مع فحص السلامة والتشغيل التلقائي'],
  ],
  [24, 76],
));
bodyChildren.push(spacer());

// ═══ 4. نقطة البيع ═══
bodyChildren.push(h1('4. نقطة البيع السريعة (POS)'));
bodyChildren.push(body('صُممت شاشة البيع لتُنجز الفاتورة في ثوانٍ وبأقل عدد من الضغطات، وهي مهيأة للعمل اليومي المكثف للكاشير:'));
[
  'بحث فوري بالاسم أو الباركود أو رقم IMEI — قارئ الباركود يعمل مباشرة في حقل البحث.',
  'بيع الأجهزة المتتبعة بالـ IMEI باختيار الجهاز المطلوب من قائمة الأجهزة المتوفرة.',
  'تعديل الكمية والسعر وخصم لكل بند أو على الفاتورة كاملة.',
  'اختيار العميل أو بيع نقدي، مع إمكانية إضافة عميل جديد أثناء البيع.',
  'دعم الدفع الكامل أو الجزئي والبيع بالدين (يتطلب اختيار عميل) وحساب المتبقي فوراً.',
  'زر واحد لإتمام البيع: يُخصم المخزون، ويُسجَّل الدفع في الصندوق، وتُحفظ الفاتورة للطباعة.',
  'طباعة فاتورة حرارية فور إتمام البيع مباشرة.',
].forEach((f) => bodyChildren.push(bullet(f)));

// ═══ 5. الدقة المحاسبية ═══
bodyChildren.push(h1('5. الدقة المحاسبية وسلامة البيانات'));
bodyChildren.push(body('بُني النظام على قاعدة صلبة: كل عملية مالية أو مخزنية تُنفَّذ داخل معاملة قاعدة بيانات واحدة (Transaction) لا تنجح إلا كاملة أو تُلغى بالكامل — فمثلاً عند إتمام عملية بيع يقوم النظام تلقائياً وبشكل واحد بـ:'));
[
  'إنشاء الفاتورة وبنودها برقم تسلسلي فريد.',
  'خصم الكميات من المخزون وتحديث حالة أجهزة الـ IMEI إلى (مبيع).',
  'تسجيل الدفعة في الصندوق كحركة وارد.',
  'تحديث دين العميل تلقائياً إن كان البيع بالدين.',
  'تسجيل العملية في سجل التدقيق باسم المستخدم والوقت.',
].forEach((f) => bodyChildren.push(bullet(f)));
bodyChildren.push(body('كما تُحسب أرصدة العملاء والموردين والصندوق من مجموع الحركات المسجلة نفسها — وليست أرقاماً يدوية قابلة للخطأ أو التلاعب — مما يجعل تلف الأرصدة مستحيلاً. وحذف أي فاتورة يعكس كل آثارها تلقائياً (المخزون، الصندوق، الديون) مع منع الحذف إذا كانت مرتبطة بمرتجعات أو أجهزة تم بيعها.'));

// ═══ 6. الأمان والصلاحيات ═══
bodyChildren.push(h1('6. الأمان والصلاحيات'));
bodyChildren.push(body('يدعم النظام تعدد المستخدمين بنظام أدوار وصلاحيات جاهز وقابل للتخصيص، والصلاحيات مفروضة على مستوى النظام نفسه — وليس مجرد إخفاء للأزرار:'));
bodyChildren.push(tableCaption('جدول 2: الأدوار الجاهزة في النظام'));
bodyChildren.push(featureTable(
  ['الدور', 'النطاق'],
  [
    ['مدير النظام', 'صلاحيات كاملة على كل الوحدات والإعدادات'],
    ['مدير المتجر', 'كل العمليات عدا المستخدمين والإعدادات والنسخ الاحتياطي'],
    ['كاشير', 'نقطة البيع والمبيعات والعملاء والفواتير والمرتجعات'],
    ['موظف مبيعات', 'البيع والمنتجات والعملاء والمرتجعات'],
    ['موظف مخزن', 'المنتجات والمخزون والمشتريات والموردين'],
  ],
  [26, 74],
));
bodyChildren.push(spacer(80));
[
  'جلسات دخول آمنة (تشفير كلمات المرور) وإنهاء الجلسة تلقائياً.',
  'سجل تدقيق (Audit Log) يوثق كل عملية حساسة باسم المستخدم وتاريخها.',
  'تغيير كلمة المرور لكل مستخدم وإعادة تعيينها من مدير النظام.',
].forEach((f) => bodyChildren.push(bullet(f)));

// ═══ 7. النسخ الاحتياطي ═══
bodyChildren.push(h1('7. النسخ الاحتياطي وحماية البيانات'));
[
  'نسخة احتياطية كاملة بنقرة واحدة (لقطة متسقة لقاعدة البيانات).',
  'نسخ تلقائي عند بدء التشغيل بفاصل زمني قابل للضبط من الإعدادات.',
  'فحص سلامة أي نسخة احتياطية قبل الاستعادة لمنع الملفات التالفة.',
  'استعادة آمنة: تأكيد مزدوج + نسخة أمان تلقائية من البيانات الحالية قبل الاستبدال.',
  'كل البيانات محفوظة على جهازك فقط — لا سحابة ولا إنترنت ولا اشتراكات.',
].forEach((f) => bodyChildren.push(checkItem(f)));

// ═══ 8. لماذا هذا النظام ═══
bodyChildren.push(h1('8. لماذا هذا النظام؟'));
[
  'واجهة عربية كاملة من اليمين لليسار بتصميم حديث مريح لساعات العمل الطويلة.',
  'سرعة فائقة: يعمل محلياً على جهازك بدون أي اعتماد على الإنترنت.',
  'دقة محاسبية مضمونة: كل عملية مربوطة والمجاميع محسوبة آلياً.',
  'يقلل الأخطاء البشرية ويوفر وقت الكاشير والمدير يومياً.',
  'مناسب للمحلات الصغيرة والمتوسطة — ويكبر مع نمو أعمالك.',
  'قابل للتطوير وإضافة مزايا جديدة مستقبلاً (بنية تقنية حديثة).',
  'بدون اشتراكات أو رسوم شهرية — ملكية كاملة ببياناتك.',
].forEach((f) => bodyChildren.push(checkItem(f)));

// ═══ 9. المواصفات التقنية ═══
bodyChildren.push(h1('9. المواصفات التقنية ومتطلبات التشغيل'));
bodyChildren.push(tableCaption('جدول 3: المواصفات التقنية'));
bodyChildren.push(featureTable(
  ['البند', 'التفاصيل'],
  [
    ['نوع التطبيق', 'برنامج سطح مكتب (Windows) بدون إنترنت'],
    ['التقنيات', 'React + TypeScript + Electron + SQLite + Prisma'],
    ['قاعدة البيانات', 'SQLite محلية — 20+ جدولاً علائقياً مع فهارس وقيود مرجعية'],
    ['الواجهة', 'عربية RTL — خط Rubik — Tailwind CSS'],
    ['العملة', 'الجنيه المصري (قابلة للتغيير من الإعدادات)'],
    ['الطباعة', 'طابعة حرارية 80مم أو أي طابعة A4'],
    ['متطلبات التشغيل', 'Windows 10/11 — 4GB رام — 300MB مساحة تخزين'],
    ['الحساب الافتراضي', 'admin / admin123 (يُنصح بتغييره فوراً)'],
  ],
  [30, 70],
));
bodyChildren.push(spacer());

// ═══ 10. الخلاصة ═══
bodyChildren.push(h1('10. الخلاصة'));
bodyChildren.push(body('نظام إدارة متاجر الهواتف النقّالة هو حل احترافي يجمع كل أعمال متجرك في نظام واحد متكامل — البيع والمخزون والعملاء والأموال والتقارير — ليجعل الإدارة أكثر سهولة وسرعة ودقة، ويمنحك راحة بال كاملة ببيانات محلية آمنة ونسخ احتياطي موثوق، مع واجهة عربية صُممت للاستخدام اليومي الحقيقي في المتاجر.'));

// ─────────────────────────── الرأس والتذييل ───────────────────────────

const pageHeader = new Header({
  children: [new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.START,
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND.line, space: 6 } },
    spacing: { after: 60 },
    children: [
      new TextRun({ text: 'نظام إدارة متاجر الهواتف النقّالة', size: 18, color: BRAND.mute, font: AR_FONT, rightToLeft: true }),
      new TextRun({ text: '   |   Mbile ERP', size: 18, color: BRAND.mute, font: AR_FONT }),
    ],
  })],
});

const pageFooter = new Footer({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: BRAND.line, space: 6 } },
    children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: BRAND.mute, font: AR_FONT })],
  })],
});

// ─────────────────────────── تجميع المستند ───────────────────────────

const doc = new Document({
  creator: 'Mbile ERP',
  title: 'تقرير نظام إدارة متاجر الهواتف النقّالة',
  description: 'تقرير تعريفي شامل بنظام إدارة متاجر الهواتف',
  styles: {
    default: {
      document: {
        run: { font: AR_FONT, size: 22, color: BRAND.ink },
        paragraph: { spacing: { line: 312 } },
      },
    },
  },
  features: { updateFields: true },
  sections: [
    // ── الغلاف ──
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 0, bottom: 0, left: 0, right: 0 },
        },
      },
      children: buildCoverR1RTL(coverConfig),
    },
    // ── الفهرس ──
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
        },
      },
      children: [
        new Paragraph({
          bidirectional: true,
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 300 },
          children: [new TextRun({ text: 'المحتويات', bold: true, size: 36, color: BRAND.primaryDark, font: AR_FONT, rightToLeft: true })],
        }),
        new TableOfContents('الفهرس', { hyperlink: true, headingStyleRange: '1-2' }),
        new Paragraph({
          bidirectional: true,
          alignment: AlignmentType.CENTER,
          spacing: { before: 200 },
          children: [
            new TextRun({ text: 'ملاحظة: بعد فتح المستند انقر بزر الفأرة الأيمن على الفهرس ثم اختر (تحديث الحقل) لتحديث أرقام الصفحات.', italics: true, size: 18, color: BRAND.mute, font: AR_FONT, rightToLeft: true }),
            new TextRun({ children: [new PageBreak()], font: AR_FONT }),
          ],
        }),
      ],
    },
    // ── المحتوى ──
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
          pageNumbers: { start: 1 },
        },
      },
      headers: { default: pageHeader },
      footers: { default: pageFooter },
      children: bodyChildren,
    },
  ],
});

const outPath = path.join(__dirname, '..', '..', 'docs', 'Mbile-ERP-Report.docx');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log('OK ->', outPath, `(${Math.round(buf.length / 1024)} KB)`);
});
