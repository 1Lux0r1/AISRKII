/**
 * Справочники РКИИЭ 2.0: ресурсы, типы объектов, ресурсоснабжающие
 * организации и административно-территориальное деление Москвы.
 */

export const CITY = {
  id: 'moscow',
  name: 'Москва',
  subtitle: 'Городской уровень',
  center: [55.7522, 37.6156],
  actualOn: '2026-08-07',
};

/** Ресурсы. Порядок соответствует порядку в панели «Сведения». */
export const RESOURCES = [
  { id: 'heat', name: 'Теплоснабжение', short: 'Тепло', color: '#17a673', icon: 'heat' },
  { id: 'power', name: 'Электроснабжение', short: 'Электро', color: '#e5484d', icon: 'power' },
  { id: 'water', name: 'Водоснабжение и водоотведение', short: 'Вода', color: '#2e90fa', icon: 'water' },
  { id: 'gas', name: 'Газоснабжение', short: 'Газ', color: '#f5842a', icon: 'gas' },
  { id: 'storm', name: 'Водоотведение поверхностного стока', short: 'Ливнёвка', color: '#c08a1e', icon: 'storm' },
  { id: 'collector', name: 'Коллекторное хозяйство', short: 'Коллекторы', color: '#8b5cf6', icon: 'collector' },
];

export const RESOURCE_BY_ID = Object.fromEntries(RESOURCES.map((r) => [r.id, r]));

/**
 * Типы объектов. group — укрупнённая группа для вкладки «Типы объектов»,
 * plural — заголовок строки в разделе «Состав по типам».
 */
export const OBJECT_TYPES = [
  { id: 'source', name: 'Источник', plural: 'Крупные источники', group: 'source', groupName: 'Источники' },
  { id: 'heatpoint', name: 'Тепловой пункт', plural: 'Тепловые пункты', group: 'transform', groupName: 'Преобразование' },
  { id: 'substation', name: 'Подстанция', plural: 'Подстанции', group: 'transform', groupName: 'Преобразование' },
  { id: 'pump', name: 'Насосная станция', plural: 'Насосные станции', group: 'transform', groupName: 'Преобразование' },
  { id: 'network', name: 'Сеть', plural: 'Сети', group: 'network', groupName: 'Сети' },
  { id: 'consumer', name: 'Потребитель', plural: 'Потребители', group: 'consumer', groupName: 'Потребители' },
  { id: 'equipment', name: 'Оборудование', plural: 'Оборудование', group: 'equipment', groupName: 'Оборудование' },
];

export const TYPE_BY_ID = Object.fromEntries(OBJECT_TYPES.map((t) => [t.id, t]));

export const TYPE_GROUPS = [
  { id: 'source', name: 'Источники' },
  { id: 'transform', name: 'Преобразование' },
  { id: 'network', name: 'Сети' },
  { id: 'consumer', name: 'Потребители' },
  { id: 'equipment', name: 'Оборудование' },
];

/** Состояние объекта по данным последней выгрузки. */
export const STATUSES = [
  { id: 'ok', name: 'В работе', color: '#17a673' },
  { id: 'warn', name: 'Требует внимания', color: '#f5842a' },
  { id: 'alert', name: 'Технологическое нарушение', color: '#e5484d' },
  { id: 'nodata', name: 'Нет данных', color: '#98a2b3' },
];

export const STATUS_BY_ID = Object.fromEntries(STATUSES.map((s) => [s.id, s]));

/** Ресурсоснабжающие организации. Список в фильтре зависит от выбранного ресурса. */
export const ORGANIZATIONS = [
  { id: 'moek', name: 'ПАО «МОЭК»', resources: ['heat'] },
  { id: 'mosenergo', name: 'ПАО «Мосэнерго»', resources: ['heat', 'power'] },
  { id: 'mtk', name: 'АО «МТК»', resources: ['heat'] },
  { id: 'rosseti', name: 'ПАО «Россети Московский регион»', resources: ['power'] },
  { id: 'oek', name: 'АО «ОЭК»', resources: ['power'] },
  { id: 'mos-sbyt', name: 'АО «Мосэнергосбыт»', resources: ['power'] },
  { id: 'mvk', name: 'АО «Мосводоканал»', resources: ['water'] },
  { id: 'mosvodostok', name: 'ГУП «Мосводосток»', resources: ['water', 'storm'] },
  { id: 'mosgaz', name: 'АО «Мосгаз»', resources: ['gas'] },
  { id: 'mosoblgaz', name: 'АО «Мособлгаз»', resources: ['gas'] },
  { id: 'moskollektor', name: 'ГУП «Москоллектор»', resources: ['collector'] },
];

export const ORG_BY_ID = Object.fromEntries(ORGANIZATIONS.map((o) => [o.id, o]));

export function organizationsForResources(resourceIds) {
  if (!resourceIds || !resourceIds.length) return ORGANIZATIONS;
  return ORGANIZATIONS.filter((org) => org.resources.some((r) => resourceIds.includes(r)));
}

/**
 * Административные округа. Для Новомосковского и Троицкого геометрии в наборе
 * нет, поэтому у них задан приблизительный центр и радиус контура.
 */
export const OKRUGS = [
  { id: 'cao', code: 'ЦАО', name: 'Центральный АО', color: '#c9ccd2', kind: 'core' },
  { id: 'sao', code: 'САО', name: 'Северный АО', color: '#f3a6a3', kind: 'ring' },
  { id: 'svao', code: 'СВАО', name: 'Северо-Восточный АО', color: '#a8dcc8', kind: 'ring' },
  { id: 'vao', code: 'ВАО', name: 'Восточный АО', color: '#efdf95', kind: 'ring' },
  { id: 'uvao', code: 'ЮВАО', name: 'Юго-Восточный АО', color: '#f7c79a', kind: 'ring' },
  { id: 'uao', code: 'ЮАО', name: 'Южный АО', color: '#f2b3c6', kind: 'ring' },
  { id: 'uzao', code: 'ЮЗАО', name: 'Юго-Западный АО', color: '#c3bde8', kind: 'ring' },
  { id: 'zao', code: 'ЗАО', name: 'Западный АО', color: '#a9d9d4', kind: 'ring' },
  { id: 'szao', code: 'СЗАО', name: 'Северо-Западный АО', color: '#9fc4ea', kind: 'ring' },
  // Округа за пределами обзорного экстента — учитываются в сводках.
  { id: 'zelao', code: 'ЗелАО', name: 'Зеленоградский АО', color: '#bcd9a8', kind: 'detached', center: [55.9880, 37.1800], radiusKm: 4.6 },
  { id: 'nao', code: 'НАО', name: 'Новомосковский АО', color: '#e3cfae', kind: 'detached', center: [55.5330, 37.2150], radiusKm: 8.0 },
  { id: 'tao', code: 'ТАО', name: 'Троицкий АО', color: '#cddac0', kind: 'detached', center: [55.3600, 37.0100], radiusKm: 15.5 },
];

export const OKRUG_BY_ID = Object.fromEntries(OKRUGS.map((o) => [o.id, o]));

/** Районы Москвы по округам (реальные наименования). */
export const DISTRICTS = {
  cao: ['Арбат', 'Басманный', 'Замоскворечье', 'Красносельский', 'Мещанский', 'Пресненский', 'Таганский', 'Тверской', 'Хамовники', 'Якиманка'],
  sao: ['Аэропорт', 'Беговой', 'Бескудниковский', 'Войковский', 'Восточное Дегунино', 'Головинский', 'Дмитровский', 'Западное Дегунино', 'Коптево', 'Левобережный', 'Молжаниновский', 'Савёловский', 'Сокол', 'Тимирязевский', 'Ховрино', 'Хорошёвский'],
  svao: ['Алексеевский', 'Алтуфьевский', 'Бабушкинский', 'Бибирево', 'Бутырский', 'Лианозово', 'Лосиноостровский', 'Марфино', 'Марьина Роща', 'Останкинский', 'Отрадное', 'Ростокино', 'Свиблово', 'Северное Медведково', 'Северный', 'Южное Медведково', 'Ярославский'],
  vao: ['Перово', 'Новогиреево', 'Ивановское', 'Вешняки', 'Косино-Ухтомский', 'Богородское', 'Восточное Измайлово', 'Восточный', 'Гольяново', 'Измайлово', 'Метрогородок', 'Новокосино', 'Преображенское', 'Северное Измайлово', 'Соколиная Гора', 'Сокольники'],
  uvao: ['Выхино-Жулебино', 'Капотня', 'Кузьминки', 'Лефортово', 'Люблино', 'Марьино', 'Некрасовка', 'Нижегородский', 'Печатники', 'Рязанский', 'Текстильщики', 'Южнопортовый'],
  uao: ['Бирюлёво Восточное', 'Бирюлёво Западное', 'Братеево', 'Даниловский', 'Донской', 'Зябликово', 'Москворечье-Сабурово', 'Нагатино-Садовники', 'Нагатинский Затон', 'Нагорный', 'Орехово-Борисово Северное', 'Орехово-Борисово Южное', 'Царицыно', 'Чертаново Северное', 'Чертаново Центральное', 'Чертаново Южное'],
  uzao: ['Академический', 'Гагаринский', 'Зюзино', 'Коньково', 'Котловка', 'Ломоносовский', 'Обручевский', 'Северное Бутово', 'Тёплый Стан', 'Черёмушки', 'Южное Бутово', 'Ясенево'],
  zao: ['Внуково', 'Дорогомилово', 'Крылатское', 'Кунцево', 'Можайский', 'Ново-Переделкино', 'Очаково-Матвеевское', 'Проспект Вернадского', 'Раменки', 'Солнцево', 'Тропарёво-Никулино', 'Филёвский Парк', 'Фили-Давыдково'],
  szao: ['Куркино', 'Митино', 'Покровское-Стрешнево', 'Северное Тушино', 'Строгино', 'Хорошёво-Мнёвники', 'Щукино', 'Южное Тушино'],
  zelao: ['Матушкино', 'Савёлки', 'Силино', 'Старое Крюково', 'Крюково'],
  nao: ['Внуковское', 'Воскресенское', 'Десёновское', 'Кокошкино', 'Марушкинское', 'Московский', 'Мосрентген', 'Рязановское', 'Сосенское', 'Филимонковское', 'Щербинка'],
  tao: ['Вороновское', 'Киевский', 'Клёновское', 'Краснопахорское', 'Михайлово-Ярцевское', 'Новофёдоровское', 'Первомайское', 'Роговское', 'Троицк', 'Щаповское'],
};

/** Итоговые контрольные показатели города (совпадают с макетом). */
export const CITY_TARGETS = {
  source: 71,
  heatpoint: 5432,
  consumer: 132814,
  substation: 2184,
  pump: 646,
  network: 14380,
  equipment: 9760,
  networkKm: 2356,
};

/** Уровни детализации карты. */
export const SCALES = [
  { id: 'city', name: 'город', maxZoom: 11 },
  { id: 'okrug', name: 'округ', maxZoom: 12 },
  { id: 'district', name: 'район', maxZoom: 13 },
  { id: 'object', name: 'объект', maxZoom: 22 },
];

export function scaleForZoom(zoom) {
  return SCALES.find((s) => zoom <= s.maxZoom) || SCALES[SCALES.length - 1];
}
