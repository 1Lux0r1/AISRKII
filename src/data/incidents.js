/**
 * Открытые события мониторинга: технологические нарушения, плановые работы
 * и замечания к данным, поступившим от РСО. Именно их количество показывает
 * счётчик на плашке округа.
 */

import { RESOURCES } from './catalog.js';
import { makeRng, rngInt, rngPick, rngRange } from '../utils/rng.js';

export const INCIDENT_KINDS = [
  { id: 'failure', name: 'Технологическое нарушение', color: '#e5484d', severity: 3 },
  { id: 'planned', name: 'Плановое отключение', color: '#f5842a', severity: 2 },
  { id: 'data', name: 'Замечание к данным', color: '#2e90fa', severity: 1 },
];

/** Сколько открытых событий в каждом округе (совпадает с макетом). */
const PER_OKRUG = {
  cao: 4, sao: 2, svao: 12, vao: 8, uvao: 12, uao: 5,
  uzao: 3, zao: 12, szao: 8, zelao: 1, nao: 2, tao: 1,
};

const CAUSES = {
  failure: [
    'Повреждение трубопровода, снижение давления в подающем трубопроводе',
    'Отключение секции РУ-10 кВ по действию защит',
    'Утечка на распределительной сети, локализована',
    'Останов насосного агрегата, переход на резерв',
    'Падение расхода ниже уставки на вводе',
  ],
  planned: [
    'Плановые работы по замене запорной арматуры',
    'Гидравлические испытания тепловой сети',
    'Плановая замена участка сети',
    'Регламентное обслуживание оборудования ЦТП',
  ],
  data: [
    'Не поступила суточная выгрузка от организации',
    'Расхождение паспортных характеристик с реестром',
    'Не заполнены координаты объекта',
    'Дублирование объекта в выгрузке',
    'Значение расхода вне допустимого диапазона',
  ],
};

export function buildIncidents(territories) {
  const list = [];
  let seq = 1;

  for (const okrug of territories) {
    const count = PER_OKRUG[okrug.id] || 0;
    if (!count || !okrug.districts.length) continue;
    const rng = makeRng(`incidents:${okrug.id}`);

    for (let i = 0; i < count; i += 1) {
      const district = okrug.districts[rngInt(rng, 0, okrug.districts.length - 1)];
      const kind = pickKind(rng);
      const resource = RESOURCES[rngInt(rng, 0, RESOURCES.length - 1)];
      const openedHoursAgo = Math.round(rngRange(rng, 1, 96));
      list.push({
        id: `INC-${String(seq++).padStart(4, '0')}`,
        kindId: kind.id,
        kindName: kind.name,
        severity: kind.severity,
        okrugId: okrug.id,
        okrugCode: okrug.code,
        districtId: district.id,
        districtName: district.name,
        resourceId: resource.id,
        title: rngPick(rng, CAUSES[kind.id]),
        openedHoursAgo,
        affected: rngInt(rng, 1, 340),
        latlng: district.center,
      });
    }
  }

  return list.sort((a, b) => b.severity - a.severity || a.openedHoursAgo - b.openedHoursAgo);
}

function pickKind(rng) {
  const roll = rng();
  if (roll < 0.34) return INCIDENT_KINDS[0];
  if (roll < 0.62) return INCIDENT_KINDS[1];
  return INCIDENT_KINDS[2];
}

export function countByOkrug(incidents) {
  const map = new Map();
  for (const inc of incidents) map.set(inc.okrugId, (map.get(inc.okrugId) || 0) + 1);
  return map;
}

export function countByDistrict(incidents) {
  const map = new Map();
  for (const inc of incidents) map.set(inc.districtId, (map.get(inc.districtId) || 0) + 1);
  return map;
}
