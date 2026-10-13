// Presentation-only localization. Never translate project/customer/person/document
// data in storage or outgoing API payloads. All canonical option values stay EN.
const STORAGE_KEY = 'hh-register-language-v1';
let language = 'en';
try { language = localStorage.getItem(STORAGE_KEY) === 'ru' ? 'ru' : 'en'; } catch {}

const RU = Object.freeze({
  'PROJECT CONTROL':'УПРАВЛЕНИЕ ПРОЕКТАМИ',
  'Project Register':'Реестр проектов',
  'HH Project Register':'Реестр проектов HH',
  'Sign in with your Helsingin Hitsaus Microsoft account to continue.':'Для продолжения войдите с учётной записью Microsoft Helsingin Hitsaus.',
  'Connecting securely…':'Устанавливается защищённое соединение…',
  'Preparing sign in…':'Подготовка входа…',
  'Sign in with Microsoft':'Войти через Microsoft',
  'Opening Microsoft sign-in…':'Открывается вход Microsoft…',
  'Try sign in again':'Повторить вход',
  'Starting secure server…':'Запускается защищённый сервер…',
  'Opening your company Microsoft sign-in…':'Открывается корпоративный вход Microsoft…',
  'Emergency administrator access':'Резервный вход администратора',
  'Administrator password':'Пароль администратора',
  'Emergency log in':'Резервный вход',
  'Sign in':'Войти',
  'Sign in to load data':'Войдите, чтобы загрузить данные',
  'Sign out':'Выйти',
  'Log out':'Выйти',
  'ACCESS':'ДОСТУП',
  'Authorization':'Авторизация',
  'Use your Helsingin Hitsaus Microsoft account.':'Используйте учётную запись Microsoft Helsingin Hitsaus.',
  'Install app':'Установить приложение',
  'Install Project Register as an app on this computer':'Установить Реестр проектов как приложение на этом компьютере',
  'All Projects':'Все проекты',
  'Projects in Plan':'Проекты на стадии планирования',
  'Projects currently in planning.':'Проекты на стадии планирования.',
  'Projects in Progress':'Проекты в работе',
  'Active projects.':'Активные проекты.',
  'Completed Projects':'Завершённые проекты',
  'Completed projects.':'Завершённые проекты.',
  'Projects in Refusal':'Отклонённые проекты',
  'Rejected projects.':'Отклонённые проекты.',
  'Updates Required':'Требуют обновления',
  'Projects with overdue schedule information that needs review.':'Проекты с просроченными плановыми датами, требующие проверки.',
  'Customers':'Заказчики',
  'Customer contacts.':'Контакты заказчиков.',
  'Change History':'История изменений',
  'Who changed each project field, and what changed.':'Кто и какие сведения о проектах изменил.',
  'Users & Access':'Пользователи и доступ',
  'Manage users, passwords and access rights.':'Управление пользователями и правами доступа.',
  'System messages':'Системные сообщения',
  'System warnings, delivery failures and operational notifications.':'Предупреждения, ошибки отправки и системные уведомления.',
  'Total':'Всего',
  'Plan':'Планирование',
  'Progress':'В работе',
  'Completed':'Завершён',
  'Refusal':'Отклонены',
  'Add project':'Добавить проект',
  '+ Add project':'+ Добавить проект',
  'Edit selected':'Изменить выбранный',
  'Open folder':'Открыть папку',
  'Sync folder':'Синхронизировать папку',
  'Request update':'Запросить обновление',
  '+ Add customer / representative':'+ Добавить заказчика / представителя',
  'Editable only':'Только доступные для изменения',
  'Search':'Поиск',
  'Number, project, customer…':'Номер, проект, заказчик…',
  'Reset column widths':'Сбросить ширину столбцов',
  'Reset column widths in this table':'Сбросить ширину столбцов этой таблицы',
  'Zoom out':'Уменьшить масштаб',
  'Zoom in':'Увеличить масштаб',
  'Reset table zoom to 100%':'Вернуть масштаб 100%',
  'Open table fullscreen':'Открыть таблицу на весь экран',
  'Exit table fullscreen':'Выйти из полноэкранного режима',
  'Other users currently online':'Другие пользователи сейчас онлайн',
  'Currently active on Project Register':'Сейчас работает в Реестре проектов',
  'Order No.':'№ заказа',
  'Order number':'Номер заказа',
  'Project':'Проект',
  'Project name':'Название проекта',
  'Status':'Статус',
  'Activity':'Вид деятельности',
  'Activity type':'Вид деятельности',
  'Customer':'Заказчик',
  'Representative':'Представитель',
  'Customer representative':'Представитель заказчика',
  'Phone':'Телефон',
  'Email':'Эл. почта',
  'Project Manager':'Руководитель проекта',
  'Project manager':'Руководитель проекта',
  'Work Location':'Место выполнения работ',
  'Work location':'Место выполнения работ',
  'Plan Start':'Начало (план)',
  'Plan End':'Окончание (план)',
  'Plan Duration':'Продолж. (план)',
  'Fact Start':'Начало (факт)',
  'Fact End':'Окончание (факт)',
  'Fact Duration':'Продолж. (факт)',
  'Expected Cost':'Плановая стоимость',
  'Actual Cost':'Фактическая стоимость',
  'Expected cost':'Плановая стоимость',
  'Actual cost':'Фактическая стоимость',
  'Currency':'Валюта',
  'Contract / Document':'Договор / документ',
  'Contract / document':'Договор / документ',
  'Project Folder':'Папка проекта',
  'Project folder':'Папка проекта',
  'Open in OneDrive web':'Открыть в OneDrive',
  'OneDrive web':'OneDrive в браузере',
  'Update required':'Необходимо обновить',
  'Overdue by':'Просрочка',
  'No editable projects':'Нет проектов для изменения',
  'Turn off Editable only or change the current view.':'Отключите фильтр или выберите другой раздел.',
  'No matching projects':'Проекты не найдены',
  'Change the view or search term.':'Измените раздел или условия поиска.',
  'Actions':'Действия',
  'Action':'Действие',
  'Edit':'Изменить',
  'Delete':'Удалить',
  'Save':'Сохранить',
  'New':'Новый',
  'Cancel':'Отмена',
  'Close':'Закрыть',
  'Save project':'Сохранить проект',
  'Delete project':'Удалить проект',
  'Project details':'Сведения о проекте',
  'Edit project':'Изменение проекта',
  'NEW PROJECT':'НОВЫЙ ПРОЕКТ',
  'PROJECT':'ПРОЕКТ',
  'READ ONLY':'ТОЛЬКО ПРОСМОТР',
  'Read only':'Только просмотр',
  'PROJECT CHANGE RECORD':'ЗАПИСЬ ОБ ИЗМЕНЕНИИ ПРОЕКТА',
  'Project changes':'Изменения проекта',
  'Changes saved':'Изменения сохранены',
  'Updated':'Изменён',
  'Created':'Создан',
  'Deleted':'Удалён',
  'Changed by':'Кем изменено',
  'Date / time':'Дата / время',
  'Details':'Подробности',
  'Field':'Поле',
  'Before':'Было',
  'After':'Стало',
  'New project':'Создание проекта',
  'Project removed':'Удаление проекта',
  'This project was created.':'Этот проект был создан.',
  'This project was deleted.':'Этот проект был удалён.',
  'No change records match your search.':'По заданному запросу изменений нет.',
  'No project change records have been recorded yet.':'Изменений проектов пока нет.',
  'Show 250 more':'Показать ещё 250',
  'SYSTEM NOTIFICATION':'СИСТЕМНОЕ УВЕДОМЛЕНИЕ',
  'System message':'Системное сообщение',
  'No additional details.':'Дополнительных сведений нет.',
  'Send test notification':'Создать тестовое уведомление',
  'Status':'Статус',
  'Message':'Сообщение',
  'New':'Новое',
  'Read':'Прочитано',
  '● New':'● Новое',
  'No matching system messages.':'Уведомления не найдены.',
  'No system messages yet.':'Системных уведомлений пока нет.',
  'User':'Пользователь',
  'Roles':'Роли',
  'Emergency PIN':'Резервный PIN',
  'Microsoft account':'Учётная запись Microsoft',
  'User name':'Имя пользователя',
  'Add user':'Добавить пользователя',
  'Save changes':'Сохранить изменения',
  'Saving…':'Сохранение…',
  'All changes saved':'Все изменения сохранены',
  'Linked':'Связан',
  'New emergency PIN':'Новый резервный PIN',
  'Access denied':'Доступ запрещён',
  'Main administrator':'Главный администратор',
  'Local administrator':'Локальный администратор',
  'Project manager — edit own projects':'Руководитель проекта — изменение своих проектов',
  'View all projects — read only':'Просмотр всех проектов — только чтение',
  'Local administrator — edit all projects':'Локальный администратор — изменение всех проектов',
  'Project manager':'Руководитель проекта',
  'View only':'Только просмотр',
  'PROJECT':'ПРОЕКТ',
  'Generated automatically':'Создаётся автоматически',
  'Planned dates':'Плановые даты',
  'Actual dates':'Фактические даты',
  'Start':'Начало',
  'End':'Окончание',
  'Duration':'Продолжительность',
  'Fields marked * are required.':'Поля со знаком * обязательны.',
  'Enter at least one contact: phone or email.':'Укажите хотя бы один контакт: телефон или эл. почту.',
  'First time on this computer?':'Первый раз на этом компьютере?',
  'Need an opener?':'Нужна программа открытия папок?',
  'CUSTOMERS':'ЗАКАЗЧИКИ',
  'Customer management':'Управление заказчиками',
  'Customer *':'Заказчик *',
  'Representative *':'Представитель *',
  'ORDER':'ЗАКАЗ',
  'Request project updates':'Запрос обновления проектов',
  'Choose projects to email. Each selected project receives a separate request.':'Выберите проекты. Для каждого будет отправлено отдельное письмо.',
  'Select all':'Выбрать все',
  'Select':'Выбрать',
  'To: assigned Project Managers':'Кому: назначенным руководителям проектов',
  'Send requests':'Отправить запросы',
  'DELETE PROJECT':'УДАЛЕНИЕ ПРОЕКТА',
  'Confirm project deletion':'Подтвердить удаление проекта',
  'You are about to permanently delete':'Вы собираетесь безвозвратно удалить',
  'Confirmation code':'Код подтверждения',
  'Enter the 5-character code shown below to continue. The code expires in 5 minutes.':'Введите показанный ниже пятизначный код. Он действителен 5 минут.',
  'OPEN PROJECT FOLDER':'ОТКРЫТИЕ ПАПКИ ПРОЕКТА',
  'Folder opener is required':'Необходимо средство открытия папок',
  'Already installed? Enable in this browser':'Уже установлено? Включить в браузере',
  'OPTIONAL DESKTOP APP':'ДОПОЛНИТЕЛЬНОЕ ПРИЛОЖЕНИЕ',
  'Install HH Project Register':'Установить Реестр проектов HH',
  'Installation is optional. You can always use the same website in your browser or open it from your HTML shortcut. All information stays on the server and updates automatically.':'Установка необязательна. Вы можете пользоваться сайтом в браузере или открывать его через HTML-ярлык. Все данные хранятся на сервере и обновляются автоматически.',
  'Got it':'Понятно',
  'Please wait…':'Пожалуйста, подождите…',
  'Please wait. Do not close this page.':'Пожалуйста, подождите. Не закрывайте страницу.',
  'The operation is in progress.':'Операция выполняется.',
  'Loading projects…':'Загрузка проектов…',
  'Preparing the project register.':'Подготовка реестра проектов.',
  'Signed out.':'Вы вышли из системы.',
  'In plan':'В плане',
  'Offer Preparation':'Подготовка КП',
  'Awaiting Client Decision':'Ожидание решения заказчика',
  'Confirmed':'Подтверждён',
  'In Progress':'В работе',
  'Completed':'Завершён',
  'Rejected':'Отклонён',
  'Ship repair':'Судоремонт',
  'Ship Repair':'Судоремонт',
  'Shiprepair':'Судоремонт',
  'Shipbuilding':'Судостроение',
  'Ship building':'Судостроение',
  'Ship Building':'Судостроение',
  'Repair':'Ремонт',
  'Manufacturing':'Изготовление',
  'Production':'Производство',
  'Construction':'Строительство',
  'Maintenance':'Техническое обслуживание',
  'Installation':'Монтаж',
  'Dismantling':'Демонтаж',
  'Welding':'Сварочные работы',
  'Piping':'Трубопроводные работы',
  'Outsourcing':'Аутсорсинг',
  'Subcontracting':'Субподряд',
  'Steel works':'Корпусные работы',
  'Steel Works':'Корпусные работы',
  'Electrical works':'Электромонтажные работы',
  'Electrical Works':'Электромонтажные работы',
  'Other':'Другое',
  'Other works':'Прочие работы',
  'Purchase':'Закупка',
  'Delivery':'Поставка',
  'Supplies':'Поставки',
  'Services':'Услуги',
  'Electrical':'Электромонтаж',
  'Mechanical':'Механические работы',
  'Consulting':'Консалтинг',
  'Administration':'Административные работы',
  'Project management':'Управление проектом',
  'Planning':'Планирование',
  'Engineering':'Инжиниринг',
  'Commercial':'Коммерческая деятельность',
  'Installation works':'Монтажные работы',
  'Planned start':'Плановое начало',
  'Planned end':'Плановое завершение',
  'Actual start':'Фактическое начало',
  'Actual end':'Фактическое завершение',
  'Customer phone':'Телефон заказчика',
  'Customer email':'Эл. почта заказчика',
  'Cost':'Стоимость',
  'Accepted':'Принято',
  'Failed':'Ошибка',
  'Not confirmed':'Не подтверждено',
  'Today':'Сегодня',
  'Project status':'Статус проекта',
  'Actual start date missing':'Нет фактической даты начала',
  'Project status update required':'Необходимо обновить статус проекта',
  'Project completion update required':'Необходимо подтвердить завершение проекта',
  'System':'Система',
  'REMINDERS':'НАПОМИНАНИЯ',
  'ONEDRIVE':'ONEDRIVE',
  'EMAIL_ACCEPTED':'ПИСЬМО ПРИНЯТО',
  'SEND_FAILED':'ОШИБКА ОТПРАВКИ',
  'RECIPIENT_INVALID':'НЕВЕРНЫЙ ПОЛУЧАТЕЛЬ',
  'DISPATCH_SUMMARY':'ИТОГ РАССЫЛКИ',
  'DISPATCH_UNKNOWN':'НЕИЗВЕСТНЫЙ СТАТУС',
  'API_FAILURE':'ОШИБКА API',
  'TEST_MESSAGE':'ТЕСТОВОЕ СООБЩЕНИЕ',
  'FOLDER_SYNC_UNAVAILABLE':'СИНХРОНИЗАЦИЯ НЕДОСТУПНА',
  'MAIL_CONFIG':'НАСТРОЙКА ПОЧТЫ',
  'DATA_LOAD':'ЗАГРУЗКА ДАННЫХ',
  'info':'Информация',
  'warning':'Предупреждение',
  'error':'Ошибка',
  'Language':'Язык',
  'Interface language':'Язык интерфейса',
  'Project name *':'Название проекта *',
  'Status *':'Статус *',
  'Enter a customer phone number or email address':'Укажите телефон или электронную почту заказчика',
  'Planned end cannot be before planned start':'Плановое окончание не может быть раньше начала',
  'Actual end cannot be before actual start':'Фактическое окончание не может быть раньше начала',
  'No projects currently require an update.':'Сейчас нет проектов, требующих обновления.',
  'Sending…':'Отправка…',
  'Sending':'Отправка',
  'Finished':'Завершено',
  'Selected':'Выбрано',
  'selected':'выбрано',
  'accepted':'принято',
  'not confirmed':'не подтверждено',
  'View only':'Только просмотр',
  'No registered Project Manager email':'Не указан адрес руководителя проекта',
  'Current folder':'Текущая папка',
  'Copy':'Копировать',
  'Open':'Открыть',
  'Project updated.':'Проект обновлён.',
  'Customer directory updated.':'Справочник заказчиков обновлён.',
  'User added.':'Пользователь добавлен.',
  'User deleted.':'Пользователь удалён.',
  'Project and its OneDrive folder were deleted.':'Проект и его папка OneDrive удалены.',
  'Project Register Folder Opener is not enabled in this browser. Install it once on this computer. If it is already installed, enable it for this browser below.':'Средство открытия папок реестра не включено в этом браузере. Установите его один раз на компьютер или разрешите работу в этом браузере.',
  'No change records match your search.':'По заданному запросу изменений нет.',
  'Drag to resize · Double-click to reset · Arrow keys to adjust':'Перетащите для изменения · Двойной щелчок — сброс · Стрелки — размер',
  'Sort order number: oldest first':'Сортировка: сначала старые номера',
  'Sort order number: newest first':'Сортировка: сначала новые номера',
  'The following information needs to be updated:':'Следующие сведения необходимо обновить:',
  'All changes saved':'Все изменения сохранены',
  'Save changes':'Сохранить изменения',
  'NOTIFICATION':'УВЕДОМЛЕНИЕ',
  'Open message':'Открыть сообщение',
  'Group':'Группа',
  'Status changed':'Статус изменён',
  'Project name':'Название проекта',
  'Contract':'Договор'
});

// Maps only canonical, explicitly controlled enum / lookup values.
// Unknown activity values are left intact rather than guessed or mutated.
const STATUS_VALUES = new Set(['In plan','Offer Preparation','Awaiting Client Decision','Confirmed','In Progress','Completed','Rejected']);
const KNOWN_ACTIVITIES = new Set([
  'Ship repair','Ship Repair','Shiprepair','Shipbuilding','Ship building','Ship Building',
  'Repair','Manufacturing','Production','Construction','Maintenance','Installation',
  'Dismantling','Welding','Piping','Outsourcing','Subcontracting','Steel works','Steel Works',
  'Electrical works','Electrical Works','Other','Other works','Purchase','Delivery','Supplies',
  'Services','Electrical','Mechanical','Consulting','Administration','Project management',
  'Planning','Engineering','Commercial','Installation works'
]);

export function getLanguage() { return language; }
export function setLanguage(value) {
  language = value === 'ru' ? 'ru' : 'en';
  document.documentElement.lang = language;
  try { localStorage.setItem(STORAGE_KEY, language); } catch {}
  applyStaticTranslations();
}
export function t(value) {
  const text = String(value ?? '');
  if (language !== 'ru') return text;
  const required = text.match(/^(.*?)(\s*\*)$/);
  return RU[text] || (required && RU[required[1]] ? RU[required[1]] + required[2] : text);
}
export function fieldText(value, fieldName) {
  if (language !== 'ru' || value == null) return value == null ? '' : String(value);
  if (fieldName === 'status' || fieldName === 'Status') {
    return STATUS_VALUES.has(String(value)) ? t(value) : String(value);
  }
  if (fieldName === 'activityType' || fieldName === 'Activity type' || fieldName === 'Activity') {
    return KNOWN_ACTIVITIES.has(String(value)) ? t(value) : String(value);
  }
  return String(value);
}
export function translateHistoryValue(value, fieldName) {
  return fieldText(value, fieldName);
}

// Snapshot static markup once. Dynamic user-provided content (#content, auth
// identity, project title etc.) is never traversed nor translated.
let staticText = [];
let staticAttributes = [];
let initialized = false;
export function initStaticTranslations() {
  if (initialized) return;
  initialized = true;
  const dynamic = [
    '#content', '#viewTitle', '#viewSubtitle', '#metrics', '#notice',
    '#authBtn', '#authUserName', '#authUserRole', '#otherActiveUsers',
    '#systemMessageSubject', '#systemMessageMetadata', '#systemMessageDetails',
    '#changeHistoryDialogTitle', '#changeHistoryDialogMeta', '#changeHistoryDialogAction',
    '#changeHistoryDetailSummary', '#changeHistoryDetailsBody', '#landingStatus',
    '#landingMicrosoftText', '#projectModeLabel', '#projectDialogTitle',
    '#projectValidation', '#projectLockNotice', '#projectRequiredHelp',
    '#deleteProjectName', '#deleteProjectCode', '#deleteValidation',
    '#updateRequestsBody', '#updateRequestsSelectedCount',
    '#updateRequestsProgress', '#customersBody', '#installAppInstructions',
    '#busyTitle', '#busyText', '#systemMessagesUnreadCount', '#updatesRequiredCount',
    '#openerHelpStatus'
  ].join(',');
  const skip = el => el?.closest?.(dynamic);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (!node.parentElement || skip(node.parentElement)) continue;
    const value = node.nodeValue;
    const trimmed = value.trim();
    if (!trimmed || (t(trimmed) === trimmed && !RU[trimmed] &&
        !RU[trimmed.replace(/\s*\*$/, '')])) continue;
    if (node.parentElement.matches?.('label.field > span')) {
      node.parentElement.dataset.i18nSource = trimmed.replace(/\s*\*$/, '');
    }
    staticText.push({ node, en: value, prefix: value.slice(0, value.indexOf(trimmed)), suffix: value.slice(value.indexOf(trimmed) + trimmed.length) });
  }
  for (const el of document.querySelectorAll('[placeholder],[title],[aria-label]')) {
    if (skip(el)) continue;
    for (const attr of ['placeholder','title','aria-label']) {
      const value = el.getAttribute(attr);
      if (value && RU[value]) staticAttributes.push({el, attr, en:value});
    }
  }
  applyStaticTranslations();
}
export function applyStaticTranslations() {
  if (!initialized) return;
  for (const item of staticText) {
    item.node.nodeValue = item.prefix + t(item.en.trim()) + item.suffix;
  }
  for (const item of staticAttributes) {
    item.el.setAttribute(item.attr,t(item.en));
  }
}

// Translate only UI controls generated by JavaScript. Never translate td
// values, user names, project names, customer names or free-text entries.
export function localizeGeneratedUi(root) {
  if (!root) return;
  for (const el of root.querySelectorAll('th,button,.role-check-item > span,.user-access-draft-count')) {
    if (el.children.length) continue;
    const raw = el.textContent;
    if (RU[raw.trim()]) el.textContent = t(raw.trim());
  }
  for (const el of root.querySelectorAll('[placeholder],[title],[aria-label]')) {
    for (const attr of ['placeholder','title','aria-label']) {
      const raw = el.getAttribute(attr);
      if (raw && RU[raw]) el.setAttribute(attr,t(raw));
    }
  }
}
