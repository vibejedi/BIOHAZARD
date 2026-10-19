export const COURSES = {
  dust2: {
    name: 'DUST II', description: 'Original CS 1.6 map · Zombie quarantine',
    stages: [{ map: 'dust2', waves: 5 }],
  },
  'hl-campaign': {
    name: 'BLACK MESA LOCKDOWN', description: 'Half-Life mini campaign · 3 chapters · 9 waves',
    stages: [{ map: 'c1a0', waves: 3 }, { map: 'c1a1', waves: 3 }, { map: 'c1a2', waves: 3 }],
  },
};

export const courseWaves = id => COURSES[id].stages.reduce((sum, stage) => sum + stage.waves, 0);
export const courseKills = id => { const n = courseWaves(id); return n * (n + 5); };
export const stageEndWave = (id, index) => COURSES[id].stages.slice(0, index + 1).reduce((sum, stage) => sum + stage.waves, 0);
