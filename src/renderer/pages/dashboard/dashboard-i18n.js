(function () {
  'use strict';

  var DEFAULT_LANG = 'ar';
  var localeCache = window.TAAGER_DASHBOARD_LOCALES || {};
  var observer = null;
  var applying = false;
  var pendingRoots = new Set();
  var pendingFrame = 0;

  function lang() {
    return window._kbotLang || localStorage.getItem('kbot-lang') || DEFAULT_LANG;
  }

  function pack(nextLang) {
    return localeCache[nextLang || lang()] || localeCache.en || localeCache.ar || { dir: 'rtl', locale: 'ar-EG-u-nu-latn', strings: {}, raw: {} };
  }

  function interpolate(value, params) {
    if (!params || typeof value !== 'string') return value;
    return value.replace(/\{(\w+)\}/g, function (_, key) {
      return params[key] == null ? '' : String(params[key]);
    });
  }

  function isQuestionMarkText(text) {
    text = String(text == null ? '' : text).trim();
    if (!text) return false;
    var letters = text.replace(/[\s\d.,:;()[\]{}+\-*/%|_'"`~!@#$^&=<>\\]/g, '');
    return letters.length > 0 && /^[?؟]+$/.test(letters);
  }

  function isGarbledFallbackText(text) {
    text = String(text == null ? '' : text).trim();
    if (!text) return false;
    var questionMarks = (text.match(/[?؟]/g) || []).length;
    if (questionMarks < 3) return false;
    var readableLetters = text.replace(/[?؟\s\d.,:;()[\]{}+\-*/%|_'"`~!@#$^&=<>\\]/g, '');
    return questionMarks >= readableLetters.length * 2;
  }

  function textUnavailable() {
    return isRtl() ? 'نص غير متوفر' : 'Text unavailable';
  }

  var AR_FALLBACKS = {
    'Dashboard': 'لوحة التحكم',
    'Master Dashboard': 'لوحة التحكم الرئيسية',
    'Performance Overview': 'نظرة عامة على الأداء',
    'Comprehensive overview of your real bot business performance': 'نظرة شاملة على أداء أعمال البوت الفعلية',
    'Current Period': 'الفترة الحالية',
    'Earned Taager Profit': 'الربح المحصل',
    'Incoming Taager Profit': 'الربح القادم',
    'Lost Taager Profit': 'الربح المفقود',
    'Earned Taager Profit After Tax': 'الربح المحصل بعد الضريبة',
    'Incoming Taager Profit After Tax': 'الربح القادم بعد الضريبة',
    'Lost Taager Profit After Tax': 'الربح المفقود بعد الضريبة',
    'Taager Profit After Tax': 'الربح بعد الضريبة',
    'Earned Profit After Tax': 'الربح المحصل بعد الضريبة',
    'Incoming Profit After Tax': 'الربح القادم بعد الضريبة',
    'Lost Profit After Tax': 'الربح المفقود بعد الضريبة',
    'Profit After Tax': 'الربح بعد الضريبة',
    'Confirmation Rate': 'نسبة التأكيد',
    'DR Rate': 'نسبة DR',
    'Total Orders': 'إجمالي الطلبات',
    'orders': 'طلبات',
    'Total Sales': 'إجمالي المبيعات',
    'Average Order Value (AOV)': 'متوسط قيمة الطلب (AOV)',
    'Total Delivered Sales': 'إجمالي مبيعات الطلبات المسلمة',
    'Average Order Value (Delivered)': 'متوسط قيمة الطلب المسلم',
    'Net ROAS': 'العائد الصافي على الإعلان',
    'Net Total Sales': 'صافي إجمالي المبيعات',
    'Net Total Delivered Sales': 'صافي مبيعات الطلبات المسلمة',
    'Total / Net Orders': 'إجمالي / صافي الطلبات',
    'Earned': 'محصل',
    'Incoming': 'قادم',
    'Lost': 'مفقود',
    'Pending Confirmation': 'بانتظار التأكيد',
    'Awaiting Confirmation': 'بانتظار التأكيد',
    'Confirmed': 'مؤكد',
    'Processing': 'قيد المعالجة',
    'On Hold': 'قيد الانتظار',
    'Waiting': 'قيد الانتظار',
    'Shipping': 'قيد الشحن',
    'In Shipping': 'قيد الشحن',
    'Delivered': 'تم التسليم',
    'Order received': 'تم استلام الطلب',
    'Failed / Canceled': 'فشل / ملغي',
    'Failed': 'فشل',
    'Canceled': 'ملغي',
    'Net Delivery Rate (NDR)': 'معدل التسليم الصافي (NDR)',
    'Net delivery rate': 'معدل التسليم الصافي',
    'Delivery Rate (DR)': 'معدل التسليم (DR)',
    'Delivered AOV': 'متوسط قيمة الطلب المسلم',
    'Average Delivery Time': 'متوسط وقت التسليم',
    'Average delivery time': 'متوسط وقت التسليم',
    'Average delivered order value': 'متوسط قيمة الطلب المسلم',
    'Unavailable': 'غير متاح',
    'Collected': 'تم التحصيل',
    'Gap': 'الفجوة',
    'Products driving 80% of Taager Profit After Tax': 'منتجات تحقق 80% من الربح بعد الضريبة',
    'Products driving 80% of Profit After Tax': 'منتجات تحقق 80% من الربح بعد الضريبة',
    'products': 'منتجات',
    'Active cities': 'المدن النشطة',
    'cities': 'مدن',
    'Taager Profit After Tax growth': 'نمو الربح بعد الضريبة',
    'Profit After Tax growth': 'نمو الربح بعد الضريبة',
    'Delivered sales': 'المبيعات المسلمة',
    'vs previous period': 'مقارنة بالفترة السابقة',
    'Average Daily Taager Profit': 'متوسط الربح اليومي',
    'Average Daily Profit': 'متوسط الربح اليومي',
    'Best Day': 'أفضل يوم',
    'Worst Day': 'أضعف يوم',
    'Days Above Average': 'أيام فوق المتوسط',
    'General Trend': 'الاتجاه العام',
    'Upward': 'اتجاه صاعد',
    'Downward': 'اتجاه هابط',
    'Upward ?': 'اتجاه صاعد',
    'Downward ?': 'اتجاه هابط',
    'View Order Details': 'عرض تفاصيل الطلبات',
    'COD Collection': 'تحصيل COD',
    'Top Collected Cities': 'أعلى المدن تحصيلا',
    'View All Cities': 'عرض كل المدن',
    'Daily Taager Profit After Tax Trend': 'اتجاه الربح بعد الضريبة اليومي',
    'Daily Profit After Tax Trend': 'اتجاه الربح بعد الضريبة اليومي',
    'Top Products': 'أفضل المنتجات',
    'Delivered Count': 'عدد التسليمات',
    'Calculator Snapshot': 'لقطة الحاسبة',
    'Calculator Results Preview': 'معاينة نتائج الحاسبة',
    'Read-only snapshot from Account Calculator': 'لقطة قراءة فقط من حاسبة الحساب',
    'Ad spend': 'الإنفاق الإعلاني',
    'from calculator': 'من الحاسبة',
    'Delivered orders': 'الطلبات المسلمة',
    'Revenue': 'الإيرادات',
    'delivered × simulator profit after tax per delivered order': 'المسلم × ربح المحاكاة بعد الضريبة لكل طلب مسلم',
    'Net profit': 'صافي الربح',
    'Net Profit': 'صافي الربح',
    'revenue - spend': 'الإيرادات - الإنفاق',
    'spend ÷ total orders': 'الإنفاق ÷ إجمالي الطلبات',
    'Break-even deliveries': 'تسليمات التعادل',
    'needed to cover spend': 'المطلوبة لتغطية الإنفاق',
    'Return on investment': 'العائد على الاستثمار',
    'Return on Investment': 'العائد على الاستثمار',
    'Calculator note': 'ملاحظة الحاسبة',
    'Calculate more details in Account Calculator': 'احسب تفاصيل أكثر في حاسبة الحساب',
    'Quick Indicator Summary': 'ملخص المؤشرات السريع',
    'Best Expansion List': 'قائمة أفضل توسع',
    'Candidate cities for expansion based on index': 'مدن مرشحة للتوسع حسب المؤشر',
    'City': 'المدينة',
    'Orders': 'الطلبات',
    'Expansion': 'التوسع',
    'Risk': 'المخاطر',
    'Profitable': 'مربح',
    'Near break-even': 'قريب من التعادل',
    'Losing': 'خاسر',
    'Profitable ROI': 'عائد مربح',
    'Losing ROI': 'عائد خاسر',
    'Order Pipeline': 'مسار الحالات',
    'Status Pipeline': 'مسار الحالات',
    'Order Pipeline · COD Collection': 'مسار الحالات · تحصيل COD',
    'Status Pipeline · COD Collection': 'مسار الحالات · تحصيل COD',
    'Order Pipeline (Fulfillment Funnel)': 'مسار الحالات (قمع التنفيذ)',
    'Status Pipeline (Fulfillment Funnel)': 'مسار الحالات (قمع التنفيذ)',
    'Taager Profit Health': 'صحة الربح',
    'Profit Health': 'صحة الربح',
    'Total Taager Profit After Tax': 'إجمالي الربح بعد الضريبة',
    'Total Profit After Tax': 'إجمالي الربح بعد الضريبة',
    'Enter your campaign data': 'أدخل بيانات حملتك',
    'AD SPEND': 'الإنفاق الإعلاني',
    'Enter campaign budget': 'أدخل ميزانية الحملة',
    'Marketing Spend Date Filter': 'فلتر تاريخ الإنفاق التسويقي',
    'Real Bot Indicators': 'مؤشرات البوت الحقيقية',
    'Delivered Orders': 'الطلبات المسلمة',
    'Delivery Rate NDR': 'معدل التسليم NDR',
    'Delivery Rate (NDR)': 'معدل التسليم (NDR)',
    'Simulator Profit After Tax / Delivered Order': 'ربح المحاكاة بعد الضريبة لكل طلب مسلم',
    'Quick Budget Scenarios': 'سيناريوهات ميزانية سريعة',
    'Scenario': 'السيناريو',
    'Budget': 'الميزانية',
    'Budget Forecast Results': 'نتائج توقع الميزانية',
    'Total Spend': 'إجمالي الإنفاق',
    'Cost per Order CPA': 'تكلفة الطلب CPA',
    'Cost per Order (CPA)': 'تكلفة الطلب (CPA)',
    'Break-even CPA': 'تكلفة التعادل',
    'Account Net Profit': 'صافي ربح الحساب',
    'Total Profit Before Ad Spend': 'إجمالي الربح قبل الإنفاق الإعلاني',
    'Total Revenue': 'إجمالي الإيرادات',
    'Return on Investment (ROI)': 'العائد على الاستثمار (ROI)',
    'For each 1 SAR spent': 'لكل 1 SAR يتم إنفاقه',
    'For each 1 ': 'لكل 1 ',
    ' spent': ' يتم إنفاقه',
    'x per ': 'x لكل ',
    'Return per Currency Unit (ROAS)': 'العائد لكل وحدة عملة (ROAS)',
    'Campaign Status': 'حالة الحملة',
    'Formula': 'المعادلة',
    'Saudi Riyal (SAR)': 'الريال السعودي (SAR)',
    'US Dollar (USD)': 'الدولار الأمريكي (USD)',
    'Egyptian Pound (EGP)': 'الجنيه المصري (EGP)',
    'Selected dashboard period': 'فترة لوحة التحكم المحددة',
    'Synced period': 'الفترة المتزامنة',
    'ad accounts': 'حسابات إعلانية',
    'Original spend': 'الإنفاق الأصلي',
    'Converted': 'تم التحويل',
    'Advertising Sources': 'مصادر الإنفاق الإعلاني',
    'Marketing spend converted into your calculator currency.': 'تم تحويل الإنفاق التسويقي إلى عملة الحاسبة.',
    'Profitability Optimization Studio': 'استوديو تحسين الربحية',
    'INTELLIGENCE ENGINE': 'محرك الذكاء',
    'SMART FORECASTING ENGINE': 'محرك التوقع الذكي',
    'SIMULATION CONTROLS': 'تحكم المحاكاة',
    'SIMULATION MODE — local only': 'وضع المحاكاة - محلي فقط',
    'Reset to Real Data': 'إعادة البيانات الحقيقية',
    'Ad Spend': 'الإنفاق الإعلاني',
    'EGP EXCHANGE RATE': 'سعر صرف EGP',
    'EGP Exchange Rate': 'سعر صرف EGP',
    'for 3-currency results': 'لنتائج بثلاث عملات',
    'Budget Scenario Forecast': 'توقع سيناريو الميزانية',
    'Total Expected Orders': 'إجمالي الطلبات المتوقعة',
    'Expected orders': 'الطلبات المتوقعة',
    'Net Result': 'صافي النتيجة',
    'Net result': 'صافي النتيجة',
    'Budget multiplier vs current spend': 'مضاعف الميزانية مقابل الإنفاق الحالي',
    'Please enter a valid budget': 'يرجى إدخال ميزانية صحيحة',
    'Half Budget': 'نصف الميزانية',
    'Current': 'الحالي',
    'Increase 50%': 'زيادة 50%',
    'Double 2x': 'مضاعفة 2x',
    'simulation input': 'مدخل المحاكاة',
    'auto-calculated · Orders × NDR': 'محسوب تلقائيا · الطلبات × NDR',
    'rev - spend': 'الإيرادات - الإنفاق',
    'Simulator Profit After Tax': 'ربح المحاكاة بعد الضريبة',
    'Avg Profit': 'متوسط الربح',
    'per acquired order': 'لكل طلب مكتسب',
    'PROFITABILITY SCORE': 'درجة الربحية',
    'SCALING SAFETY': 'أمان التوسع',
    'Strong': 'قوي',
    'Moderate': 'متوسط',
    'Weak': 'ضعيف',
    'Critical': 'حرج',
    'Safe to scale': 'آمن للتوسع',
    'Caution': 'تنبيه',
    'High risk': 'مخاطر عالية',
    'Do not scale': 'لا تتوسع',
    'Scale with confidence.': 'توسع بثقة.',
    'Net Delivery Rate': 'معدل التسليم الصافي',
    'Break-even Achieved': 'تم تحقيق التعادل',
    'Break-even Simulator': 'محاكي نقطة التعادل',
    '? Break-even Achieved': 'تم تحقيق التعادل',
    '? Break-even Simulator': 'محاكي نقطة التعادل',
    '? Current': 'الحالي',
    'To break even at ': 'للوصول إلى التعادل عند ',
    ' spend, you need at least one of:': ' إنفاق، تحتاج إلى واحد على الأقل من الآتي:',
    'PROFITABILITY BLOCKER': 'عائق الربحية',
    'PROFITABILITY STATUS': 'حالة الربحية',
    'UNIT ECONOMICS': 'اقتصاديات الوحدة',
    'NDR ANALYSIS': 'تحليل معدل التسليم الصافي',
    'COST ANALYSIS': 'تحليل التكلفة',
    'SCALING OPPORTUNITY': 'فرصة التوسع',
    'TAAGER PROFIT OPTIMIZATION': 'تحسين الربح',
    'PROFIT OPTIMIZATION': 'تحسين الربح',
    'ADVANCED SCENARIO PROJECTIONS': 'توقعات السيناريوهات المتقدمة',
    'MARKET': 'السوق',
    'DANGER': 'خطر',
    'SAFE': 'آمن',
    'Profit +20%': 'الربح +20%',
    'Orders ×2': 'الطلبات ×2',
    'Net ROAS: ': 'العائد الصافي على الإعلان: ',
    'Return: ': 'العائد: ',
    'profitable': 'مربح',
    'losing': 'خاسر',
    'Average Profit / Delivered Order': 'متوسط الربح لكل طلب مسلم',
    'Global exchange rates': 'أسعار الصرف العامة',
    'Refresh or edit currency rates from the dashboard top bar.': 'حدّث أو عدّل أسعار العملات من شريط لوحة التحكم العلوي.',
    'Simulate KPI changes · Detect break-even thresholds · Validate scaling safety': 'محاكاة تغييرات المؤشرات · اكتشاف حدود التعادل · التحقق من أمان التوسع',
    'Marketing ad accounts': 'حسابات التسويق الإعلانية',
    'Currency': 'العملة',
    'Converted for calculator': 'محول للحاسبة',
    'Spend synced for the selected dashboard period.': 'تمت مزامنة الإنفاق للفترة المحددة في لوحة التحكم.',
    'Assigned accounts are ready. Click Sync Now in Marketing Connections to pull spend.': 'الحسابات المخصصة جاهزة. اضغط مزامنة الآن في ربط التسويق لسحب الإنفاق.',
    'Synced spend': 'الإنفاق المتزامن',
    'used for CPA & ROI': 'يستخدم في CPA و ROI',
    'X-axis shows budget multiples. Hover any point to see the exact budget.': 'المحور الأفقي يعرض مضاعفات الميزانية. مرر على أي نقطة لرؤية الميزانية الدقيقة.',
    'Total ': 'الإجمالي ',
    'VIEW ALL PRODUCTS': 'عرض كل المنتجات',
    'The calculator shows healthy returns. Review Section 7 before scaling spend.': 'تظهر الحاسبة عوائد صحية. راجع القسم 7 قبل زيادة الإنفاق.',
    'Returns are positive but tight. Use Section 7 to test NDR, simulator profit after tax, and budget scenarios.': 'العوائد إيجابية لكنها محدودة. استخدم القسم 7 لاختبار NDR وربح المحاكاة بعد الضريبة وسيناريوهات الميزانية.',
    'Current calculator inputs point to a loss. Open Section 7 to find the break-even lever.': 'مدخلات الحاسبة الحالية تشير إلى خسارة. افتح القسم 7 للعثور على عامل التعادل.',
    'Net ROAS = delivered sales divided by ad spend. It uses only successfully delivered order revenue, so pending, canceled, and returned orders do not inflate ad performance.': 'العائد الصافي على الإعلان يساوي المبيعات المسلمة مقسومة على الإنفاق الإعلاني، ويستخدم فقط إيرادات الطلبات المسلمة بنجاح حتى لا تضخم الطلبات المعلقة أو الملغاة أو المرتجعة أداء الإعلانات.',
    'Earned Profit After Tax = sum(order profit - tax profit) for delivered orders.': 'الربح المحصل بعد الضريبة = مجموع (ربح الطلب - ضريبة الربح) للطلبات المسلمة.',
    'Incoming Profit After Tax = sum(order profit - tax profit) for active non-delivered orders.': 'الربح القادم بعد الضريبة = مجموع (ربح الطلب - ضريبة الربح) للطلبات النشطة غير المسلمة.',
    'Lost Profit After Tax = sum(order profit - tax profit) for failed and canceled orders, excluding Canceled by you.': 'الربح المفقود بعد الضريبة = مجموع (ربح الطلب - ضريبة الربح) للطلبات الفاشلة والملغاة، مع استبعاد الملغي بواسطتك.',
    'Original platform spend is converted into your calculator currency.': 'يتم تحويل إنفاق المنصة الأصلي إلى عملة الحاسبة.',
    'Net orders entered in the simulation. You can edit it for testing.': 'صافي الطلبات المدخل في المحاكاة. يمكنك تعديله للاختبار.',
    'Orders that reached the customer based on the simulated delivery rate.': 'طلبات وصلت للعميل بناء على معدل التسليم في المحاكاة.',
    'Total expected income from delivered orders multiplied by the average profit per delivered order.': 'إجمالي الدخل المتوقع من الطلبات المسلمة مضروبا في متوسط الربح لكل طلب مسلم.',
    'Net profit or loss after subtracting ad spend from revenue.': 'صافي الربح أو الخسارة بعد طرح الإنفاق الإعلاني من الإيرادات.',
    'Return percentage compared with spend. 100% means doubling your money.': 'نسبة العائد مقارنة بالإنفاق. 100% تعني مضاعفة أموالك.',
    'Cost to acquire one order. It should be lower than average profit per delivered order to stay profitable.': 'تكلفة اكتساب طلب واحد. يجب أن تكون أقل من متوسط الربح لكل طلب مسلم للبقاء مربحا.',
    'Campaign is profitable. Exceeds spend by ': 'الحملة مربحة. تتجاوز الإنفاق بمقدار ',
    'Campaign is <span class="hi-red">losing ': 'الحملة <span class="hi-red">تخسر ',
    '</span> net. Revenue of <strong>': '</span> صافي. إيرادات بقيمة <strong>',
    '</strong> does not cover spend of <strong>': '</strong> لا تغطي إنفاقا بقيمة <strong>',
    'Campaign is <span class="hi-green">profitable</span> — net profit <strong>': 'الحملة <span class="hi-green">مربحة</span> - صافي الربح <strong>',
    '</strong> on <strong>': '</strong> على إيرادات <strong>',
    '<span class="hi-red">CPA (': '<span class="hi-red">تكلفة الطلب (',
    ')</span> exceeds revenue per delivered order <strong>(': ')</span> أعلى من الإيراد لكل طلب مسلم <strong>(',
    ')</strong>. Scaling will compound losses, not profits.': ')</strong>. التوسع سيضاعف الخسائر لا الأرباح.',
    'Revenue per delivered order <span class="hi-green">(': 'الإيراد لكل طلب مسلم <span class="hi-green">(',
    ')</span> exceeds CPA <strong>(': ')</span> أعلى من تكلفة الطلب <strong>(',
    ')</strong>. Unit economics are positive — scaling is viable.': ')</strong>. اقتصاديات الوحدة إيجابية والتوسع ممكن.',
    'NDR of <span class="hi-red">': 'معدل التسليم الصافي <span class="hi-red">',
    'NDR of <span class="hi-yellow">': 'معدل التسليم الصافي <span class="hi-yellow">',
    'NDR of <span class="hi-cyan">': 'معدل التسليم الصافي <span class="hi-cyan">',
    '%</span> is critically below the danger threshold (20%). <strong>': '%</span> أقل بكثير من حد الخطر (20%). <strong>',
    ' orders</strong> are failing — primary driver of losses.': ' طلب</strong> تفشل وهي المحرك الأساسي للخسائر.',
    '%</span> is below healthy baseline (30%). Improving to 30%+ would materially impact profitability.': '%</span> أقل من خط الصحة الأساسي (30%). التحسن إلى 30% أو أكثر يؤثر بوضوح على الربحية.',
    '%</span> reaches the top delivery tier (40%). Strong delivery enables confident budget scaling.': '%</span> يصل إلى أعلى مستوى تسليم (40%). التسليم القوي يسمح بزيادة الميزانية بثقة.',
    'You are losing <span class="hi-red">': 'تخسر <span class="hi-red">',
    '</span> per delivered order. Doubling budget doubles losses.': '</span> لكل طلب مسلم. مضاعفة الميزانية تضاعف الخسائر.',
    'Doubling budget to <strong>': 'مضاعفة الميزانية إلى <strong>',
    '</strong> projects <span class="hi-red">': '</strong> تتوقع <span class="hi-red">',
    ' loss</span>. Scaling losses, not profits. Fix unit economics first.': ' خسارة</span>. هذا توسع للخسائر لا الأرباح. أصلح اقتصاديات الوحدة أولا.',
    'Scaling to 2× budget projects <span class="hi-green">': 'التوسع إلى 2x من الميزانية يتوقع <span class="hi-green">',
    ' net profit</span> at <strong>': ' صافي ربح</span> عند <strong>',
    '% ROI</strong>. Safe to scale.': '% ROI</strong>. آمن للتوسع.',
    'Increasing average profit by <span class="hi-blue">': 'زيادة متوسط الربح بمقدار <span class="hi-blue">',
    'Total number of orders received from the bot during the selected period.': 'إجمالي عدد الطلبات المستلمة من البوت خلال الفترة المحددة.',
    'Forecast delivered orders from net orders x delivery rate.': 'توقع الطلبات المسلمة من صافي الطلبات x معدل التسليم.',
    'Orders that actually reached the customer, counted from delivered sheet status.': 'الطلبات التي وصلت فعليا للعميل، محسوبة من حالة التسليم في الملف.',
    'Percentage of orders delivered successfully. Healthy benchmark starts at 30%, with top tier at 40%+.': 'نسبة الطلبات التي تم تسليمها بنجاح. يبدأ المعيار الصحي من 30%، والمستوى الأعلى عند 40% أو أكثر.',
    'Selecting a period from the top dashboard bar syncs connected marketing automatically. Update Dashboard also refreshes marketing after fetching live order data.': 'اختيار فترة من شريط لوحة التحكم العلوي يزامن التسويق المتصل تلقائيا. تحديث لوحة التحكم يحدّث التسويق أيضا بعد جلب بيانات الطلبات المباشرة.',
    'Calculator spend after converting the entered or synced spend into the selected calculator currency.': 'إنفاق الحاسبة بعد تحويل الإنفاق المدخل أو المتزامن إلى عملة الحاسبة المحددة.',
    'Cost to acquire one order. Lower CPA means the campaign is more efficient.': 'تكلفة اكتساب طلب واحد. انخفاض CPA يعني أن الحملة أكثر كفاءة.',
    'Maximum CPA before the campaign starts losing money. This simulator uses the editable Taager profit per delivered order assumption multiplied by NDR.': 'أقصى تكلفة طلب قبل أن تبدأ الحملة في خسارة المال. يستخدم هذا المحاكي افتراض ربح Taager القابل للتعديل لكل طلب مسلم مضروبا في NDR.',
    'Expected delivered orders multiplied by the editable average profit per delivered order.': 'الطلبات المسلمة المتوقعة مضروبة في متوسط الربح القابل للتعديل لكل طلب مسلم.',
    'Actual earned profit after tax from delivered orders before subtracting synced ad spend.': 'الربح المحصل فعليا بعد الضريبة من الطلبات المسلمة قبل طرح الإنفاق الإعلاني المتزامن.',
    'Whole-account profit after subtracting total synced ad spend. This can differ from SKU-matched Campaigns profit.': 'ربح الحساب بالكامل بعد طرح إجمالي الإنفاق الإعلاني المتزامن. قد يختلف هذا عن ربح الحملات المطابق للمنتجات.',
    'Measures campaign profitability. Zero means break-even, positive means profit, negative means loss.': 'يقيس ربحية الحملة. الصفر يعني التعادل، والموجب يعني ربحا، والسالب يعني خسارة.',
    'For each unit spent, how much revenue do you get back? More than 1 means revenue exceeds spend.': 'لكل وحدة يتم إنفاقها، كم إيرادا يعود لك؟ أكبر من 1 يعني أن الإيراد يتجاوز الإنفاق.',
    'For each unit spent, how much do you get back in revenue? More than 1 means revenue exceeds spend.': 'لكل وحدة يتم إنفاقها، كم تحصل كإيراد؟ أكبر من 1 يعني أن الإيراد يتجاوز الإنفاق.',
    'Actual delivered sales divided by ad spend. This ignores pending and canceled orders.': 'المبيعات المسلمة الفعلية مقسومة على الإنفاق الإعلاني. يتجاهل هذا الطلبات المعلقة والملغاة.',
    'This budget is creating a loss. Improve targeting or increase delivery rate (NDR) before adding more spend.': 'هذه الميزانية تسبب خسارة. حسّن الاستهداف أو ارفع معدل التسليم (NDR) قبل إضافة إنفاق أكبر.',
    'Weak performance close to break-even. Profit margin is thin. Improve performance before scaling.': 'أداء ضعيف قريب من التعادل. هامش الربح محدود. حسّن الأداء قبل التوسع.',
    'Excellent and profitable performance. Your campaign is generating a healthy return. Continue or raise budget carefully.': 'أداء ممتاز ومربح. حملتك تحقق عائدا صحيا. استمر أو ارفع الميزانية بحذر.'
  };

  function fallbackArabicFromEnglish(en) {
    en = String(en == null ? '' : en);
    if (AR_FALLBACKS[en]) return AR_FALLBACKS[en];
    var currencyTail = en.match(/^ ([A-Z]{3})\)<\/span> per delivery \(from $/);
    if (currencyTail) return ' ' + currencyTail[1] + '</span> لكل تسليم (من ';
    var breakevenTail = en.match(/^ ([A-Z]{3})\) would achieve break-even\.$/);
    if (breakevenTail) return ' ' + breakevenTail[1] + ') تحقق التعادل.';
    var days = en.match(/^(\d+(?:\.\d+)?) days$/i);
    if (days) return days[1] + ' يوم';
    var orders = en.match(/^(\d+(?:\.\d+)?) orders$/i);
    if (orders) return orders[1] + ' طلب';
    var of = en.match(/^(\d+(?:\.\d+)?) of (\d+(?:\.\d+)?)$/i);
    if (of) return of[1] + ' من ' + of[2];
    return '';
  }

  function t(key, params) {
    var active = pack();
    var fallback = pack(DEFAULT_LANG);
    var value = active.strings && active.strings[key];
    if (value == null && fallback.strings) value = fallback.strings[key];
    if (value == null && window._t) {
      var ext = window._t('dashboard.' + key);
      if (ext !== 'dashboard.' + key) value = ext;
    }
    if (value == null) value = key;
    if (typeof value === 'function') value = value(params);
    value = decodeMojibake(value);
    if (isQuestionMarkText(value)) value = textUnavailable();
    return interpolate(value, params);
  }

  function isRtl() {
    return (pack().dir || 'rtl') === 'rtl';
  }

  function dir() {
    return isRtl() ? 'rtl' : 'ltr';
  }

  function locale() {
    return pack().locale || (isRtl() ? 'ar-EG-u-nu-latn' : 'en-US');
  }

  function rawMap() {
    return (pack().raw || {});
  }

  function hasMojibake(text) {
    return /[\u00c3\u00c2\u00d8\u00d9\u00d0\u00d1\u00f0\u00e2]/.test(String(text || ''));
  }

  function cp1252Byte(code) {
    if (code <= 0xff) return code;
    var map = {
      0x20ac: 0x80,
      0x201a: 0x82,
      0x0192: 0x83,
      0x201e: 0x84,
      0x2026: 0x85,
      0x2020: 0x86,
      0x2021: 0x87,
      0x02c6: 0x88,
      0x2030: 0x89,
      0x0160: 0x8a,
      0x2039: 0x8b,
      0x0152: 0x8c,
      0x017d: 0x8e,
      0x2018: 0x91,
      0x2019: 0x92,
      0x201c: 0x93,
      0x201d: 0x94,
      0x2022: 0x95,
      0x2013: 0x96,
      0x2014: 0x97,
      0x02dc: 0x98,
      0x2122: 0x99,
      0x0161: 0x9a,
      0x203a: 0x9b,
      0x0153: 0x9c,
      0x017e: 0x9e,
      0x0178: 0x9f
    };
    return Object.prototype.hasOwnProperty.call(map, code) ? map[code] : null;
  }

  function decodeMojibake(text) {
    text = String(text == null ? '' : text);
    if (!hasMojibake(text) || typeof TextDecoder !== 'function') return text;
    var current = text;
    for (var pass = 0; pass < 3; pass++) {
      if (!hasMojibake(current)) break;
      var bytes = [];
      var ok = true;
      for (var i = 0; i < current.length; i++) {
        var code = current.charCodeAt(i);
        var byte = cp1252Byte(code);
        if (byte == null) {
          ok = false;
          break;
        }
        bytes.push(byte);
      }
      if (!ok) break;
      try {
        var decoded = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
        if (!decoded || decoded === current) break;
        current = decoded;
      } catch (e) {
        break;
      }
    }
    return current;
  }

  function translateRaw(text) {
    if (isRtl() || text == null) return text;
    var output = String(text);
    var protectedNames = [
      'المنطقة الشرقية',
      'منطقة الباحة',
      'منطقة الجوف',
      'منطقة الحدود الشمالية',
      'منطقة الرياض',
      'منطقة القصيم',
      'منطقة المدينة المنورة',
      'منطقة تبوك',
      'منطقة جازان',
      'منطقة حائل',
      'منطقة عسير',
      'منطقة مكة المكرمة',
      'منطقة نجران'
    ];
    var protectedMap = [];
    protectedNames
      .sort(function (a, b) { return b.length - a.length; })
      .forEach(function (name, idx) {
        if (output.indexOf(name) === -1) return;
        var token = '\uE000CITY' + idx + '\uE001';
        protectedMap.push({ token: token, name: name });
        output = output.split(name).join(token);
      });
    var map = rawMap();
    Object.keys(map)
      .sort(function (a, b) { return b.length - a.length; })
      .forEach(function (source) {
        if (!source) return;
        output = output.split(source).join(map[source]);
      });
    protectedMap.forEach(function (entry) {
      output = output.split(entry.token).join(entry.name);
    });
    return output;
  }

  function cleanText(text) {
    var output = decodeMojibake(text);
    if (isQuestionMarkText(output)) return '';
    output = output.replace(/[?؟]+/g, '').replace(/\uFFFD+/g, '').trim();
    return translateRaw(output);
  }

  function pick(en, ar) {
    var chosen = isRtl() ? ar : en;
    chosen = decodeMojibake(chosen == null ? '' : chosen);
    if (isRtl() && (isQuestionMarkText(chosen) || isGarbledFallbackText(chosen))) {
      var enPack = localeCache.en || {};
      var arPack = localeCache.ar || {};
      var enStrings = enPack.strings || {};
      var arStrings = arPack.strings || {};
      var keys = Object.keys(enStrings);
      for (var i = 0; i < keys.length; i++) {
        if (enStrings[keys[i]] === en && arStrings[keys[i]] != null) {
          chosen = decodeMojibake(arStrings[keys[i]]);
          break;
        }
      }
      if (isQuestionMarkText(chosen) || isGarbledFallbackText(chosen)) chosen = fallbackArabicFromEnglish(en) || en;
    }
    if (isQuestionMarkText(chosen) || isGarbledFallbackText(chosen)) chosen = en || '';
    return cleanText(chosen);
  }

  function formatNumber(value, opts) {
    var n = Number(value);
    if (!isFinite(n)) return value == null ? '' : String(value);
    return new Intl.NumberFormat(locale(), opts || {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(n);
  }

  function formatCurrency(value, currency, decimals) {
    var n = Number(value);
    if (!isFinite(n)) return value == null ? '' : String(value);
    return new Intl.NumberFormat(locale(), {
      style: 'currency',
      currency: currency || 'SAR',
      minimumFractionDigits: decimals == null ? 0 : decimals,
      maximumFractionDigits: decimals == null ? 0 : decimals
    }).format(n);
  }

  function monthName(index) {
    var names = isRtl()
      ? ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
      : ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return names[index] || '';
  }

  function formatMonth(year, monthIndex) {
    return monthName(monthIndex) + ' ' + formatNumber(year, { useGrouping: false });
  }

  function formatTime(ts) {
    var d = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(d.getTime())) return t('shell.noUpdate');
    return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(d);
  }

  function formatTimestamp(ts) {
    if (!ts) return t('shell.noUpdate');
    var d = new Date(ts);
    if (isNaN(d.getTime())) return t('shell.noUpdate');
    var now = new Date();
    var sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (sameDay) return t('time.todayAt', { time: formatTime(d) });
    return new Intl.DateTimeFormat(locale(), {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
  }

  function localizeTextNode(node) {
    if (!node || !node.nodeValue) return;
    var parent = node.parentElement;
    if (parent && parent.closest && parent.closest('.taager-help,.s7-tip-badge,[data-preserve-question-mark],[data-i18n-preserve]')) return;
    if (!/[\u0600-\u06FF]|[\u00c3\u00c2\u00d8\u00d9\u00d0\u00d1\u00f0\u00e2]/.test(node.nodeValue) && !isQuestionMarkText(node.nodeValue)) return;
    var translated = cleanText(node.nodeValue);
    if (translated !== node.nodeValue) node.nodeValue = translated;
  }

  function localizeAttributes(el) {
    if (el.closest && el.closest('[data-i18n-preserve]')) return;
    ['title', 'aria-label', 'placeholder', 'value'].forEach(function (attr) {
      if (!el.hasAttribute || !el.hasAttribute(attr)) return;
      var value = el.getAttribute(attr);
      if (!/[\u0600-\u06FF]|[\u00c3\u00c2\u00d8\u00d9\u00d0\u00d1\u00f0\u00e2]/.test(value || '') && !isQuestionMarkText(value)) return;
      el.setAttribute(attr, cleanText(value));
    });
  }

  function apply(root) {
    root = root || document.getElementById('page-dashboard');
    if (!root || applying) return;
    applying = true;
    try {
      if (root.getAttribute('dir') !== dir()) root.setAttribute('dir', dir());
      if (root.getAttribute('lang') !== lang()) root.setAttribute('lang', lang());
      if (root.classList.contains('dash-dir-rtl') !== isRtl()) root.classList.toggle('dash-dir-rtl', isRtl());
      if (root.classList.contains('dash-dir-ltr') === isRtl()) root.classList.toggle('dash-dir-ltr', !isRtl());

      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (node) {
          var parent = node.parentElement;
          if (!parent || /^(SCRIPT|STYLE|TEXTAREA)$/i.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (parent.closest && parent.closest('.taager-help,.s7-tip-badge,[data-preserve-question-mark],[data-i18n-preserve]')) return NodeFilter.FILTER_REJECT;
          return (/[\u0600-\u06FF]|[\u00c3\u00c2\u00d8\u00d9\u00d0\u00d1\u00f0\u00e2]/.test(node.nodeValue || '') || isQuestionMarkText(node.nodeValue)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      });
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(localizeTextNode);
      root.querySelectorAll('[title],[aria-label],[placeholder],[value]').forEach(localizeAttributes);
    } finally {
      applying = false;
    }
  }

  function setDirectionClasses() {
    var page = document.getElementById('page-dashboard');
    if (page) apply(page);
  }

  function observe() {
    if (observer || !window.MutationObserver) return;
    var page = document.getElementById('page-dashboard');
    if (!page) return;
    function queueRoot(node) {
      var root = node && node.nodeType === Node.ELEMENT_NODE ? node : (node && node.parentElement);
      if (!root || !page.contains(root)) return;
      var pane = root.closest && root.closest('.dash-section-cache-pane');
      if (pane && pane.hidden) return;
      pendingRoots.forEach(function (queued) {
        if (root && queued !== root && queued.contains(root)) root = null;
        else if (root && root.contains(queued)) pendingRoots.delete(queued);
      });
      if (root) pendingRoots.add(root);
    }
    function flushRoots() {
      pendingFrame = 0;
      if (applying) return;
      var roots = Array.from(pendingRoots);
      pendingRoots.clear();
      roots.forEach(function (root) { if (root && root.isConnected) apply(root); });
    }
    observer = new MutationObserver(function (mutations) {
      if (applying) return;
      mutations.forEach(function (mutation) {
        if (mutation.type === 'childList') {
          Array.prototype.forEach.call(mutation.addedNodes || [], queueRoot);
        } else {
          queueRoot(mutation.target);
        }
      });
      if (pendingRoots.size && !pendingFrame) pendingFrame = requestAnimationFrame(flushRoots);
    });
    observer.observe(page, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['title', 'aria-label', 'placeholder', 'value']
    });
  }

  window.dashboardI18n = {
    t: t,
    raw: translateRaw,
    clean: cleanText,
    apply: apply,
    observe: observe,
    dir: dir,
    isRtl: isRtl,
    locale: locale,
    decodeMojibake: decodeMojibake,
    number: formatNumber,
    currency: formatCurrency,
    monthName: monthName,
    formatMonth: formatMonth,
    formatTimestamp: formatTimestamp,
    pick: pick,
    isQuestionMarkText: isQuestionMarkText,
    get currentLocale() { return lang(); }
  };

  window.dashT = t;
  window.dashText = translateRaw;
  window.dashIsRtl = isRtl;
  window.dashDir = dir;
  window.dashNum = formatNumber;
  window.dashCurrency = formatCurrency;

  window.addEventListener('taager-lang-change', setDirectionClasses);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      observe();
      setDirectionClasses();
    });
  } else {
    observe();
    setDirectionClasses();
  }
})();
