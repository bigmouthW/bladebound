import { CONFIG, STAGES } from './config.js';

export const MODULES = {
  grove: { label: '竹间拾光', fruits: [[650,455],[785,450],[920,455],[1055,450],[1350,430],[1485,430]], enemies: [[1930,'archer']], spikes: [], pits: [] },
  orchard: { label: '两径春色', fork: true, fruits: [[350,450],[485,450],[770,365],[900,365],[1030,365],[1160,365],[1410,365],[1750,450]], enemies: [[1980,'heavy']], spikes: [[1510,492,76]], pits: [] },
  scout: { label: '桥头来箭', fruits: [[300,450],[430,450],[850,440],[980,440],[1500,430],[1640,430]], enemies: [[1100,'archer'],[2020,'archer']], spikes: [[550,492,65]], pits: [[1260,1350]] },
  guardian: { label: '守桥之刃', fruits: [[320,450],[450,450],[580,450],[950,420],[1100,420],[1600,445]], enemies: [[1380,'shield'],[2020,'archer']], spikes: [[730,492,72]], pits: [] },
  teeth: { label: '踏影越棘', fruits: [[300,450],[430,450],[800,410],[930,410],[1450,445],[1580,445]], enemies: [[1900,'heavy']], spikes: [[610,492,70],[1130,492,85]], pits: [] },
  windpath: { label: '赤桥分岔', fork: true, fruits: [[330,450],[460,450],[770,365],[900,365],[1040,365],[1190,365],[1440,365],[1900,450]], enemies: [[1540,'archer',399],[2120,'shield']], spikes: [[1240,400,65]], pits: [] },
  shieldline: { label: '破甲回响', fruits: [[300,450],[430,450],[560,450],[1050,430],[1190,430],[1660,440]], enemies: [[820,'shield'],[1490,'shield'],[2080,'archer']], spikes: [], pits: [[1780,1880]] },
  crossfire: { label: '风过赤桥', fruits: [[300,450],[440,450],[900,430],[1040,430],[1570,440]], enemies: [[700,'archer'],[1400,'heavy'],[2060,'shield']], spikes: [[1160,492,74]], pits: [] },
  redgate: { label: '山门问刃', fruits: [[300,450],[440,450],[580,450],[1040,420],[1190,420]], enemies: [[820,'shield'],[1590,'archer'],[2040,'heavy']], spikes: [[1320,492,90]], pits: [] },
  cloudpath: { label: '云间险径', fork: true, fruits: [[320,450],[460,450],[760,365],[900,365],[1040,365],[1190,365],[1430,365],[1900,445]], enemies: [[1550,'heavy',399],[2100,'archer']], spikes: [[1230,400,76]], pits: [] },
  approach: { label: '箭雨之前', fruits: [[320,445],[450,445],[950,420],[1090,420],[1650,440],[1780,440]], enemies: [[760,'archer'],[1350,'shield'],[2100,'heavy']], spikes: [[540,492,60]], pits: [[1470,1570]] },
  courtyard: { label: '最后的守山人', fruits: [[260,445],[390,445],[520,445],[660,445],[900,420],[1040,420],[1170,420],[1300,420]], enemies: [[1670,'boss']], spikes: [], pits: [] },
};

export function buildLevel(stageIndex) {
  const stage = STAGES[stageIndex];
  const targets = [], enemies = [], spikes = [], pits = [], platforms = [], forks = [], checkpoints = [];
  const modules = stage.modules.map((id, index) => ({ id, start: index * 2400, end: (index + 1) * 2400, label: MODULES[id].label }));
  for (const [moduleIndex, id] of stage.modules.entries()) {
    const definition = MODULES[id];
    const start = moduleIndex * 2400;
    definition.fruits.forEach(([x, y], i) => targets.push({ id: `${id}-fruit-${i}`, x: start + x, y, kind: i % 5 === 4 ? 'crate' : i % 2 ? 'pear' : 'fruit', radius: i % 5 === 4 ? 23 : 20 }));
    definition.enemies.forEach(([x, type, groundY], i) => enemies.push({ id: `${id}-enemy-${i}`, x: start + x, y: groundY ?? CONFIG.floorY, type, hp: type === 'boss' ? 6 : type === 'heavy' ? 2 : 1, shield: type === 'shield' ? 1 : 0, nextShot: 0, lastHit: -10, alive: true, damageFlash: 0 }));
    definition.spikes.forEach(([x, y, width], i) => spikes.push({ id: `${id}-spike-${i}`, x: start + x, y, width, height: 35 }));
    definition.pits.forEach(([left, right]) => pits.push([start + left, start + right]));
    if (definition.fork) {
      platforms.push({ x: start + 1090, y: 410, width: 960, height: 26 });
      forks.push({ id: `${id}-route`, start: start + 630, end: start + 1550, judgeX: start + 1370, thresholdY: 408, claimed: false });
    }
    if (moduleIndex === 2) checkpoints.push(start + 100);
  }
  const floorSegments = [];
  let cursor = -400;
  for (const [left, right] of pits.sort((a, b) => a[0] - b[0])) { floorSegments.push({ left: cursor, right: left }); cursor = right; }
  floorSegments.push({ left: cursor, right: CONFIG.stageLength + 800 });
  return { stage, modules, targets, enemies, spikes, pits, platforms, forks, checkpoints, floorSegments, finishX: CONFIG.stageLength - 130 };
}
