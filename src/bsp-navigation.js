export function insidePolygon(x, z, vertices) {
  let positive = false, negative = false;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const cross = (b[0] - a[0]) * (z - a[2]) - (b[2] - a[2]) * (x - a[0]);
    if (cross > 0.0001) positive = true;
    if (cross < -0.0001) negative = true;
    if (positive && negative) return false;
  }
  return true;
}

export class MapCollision {
  constructor(data) {
    this.data = data; this.cells = new Map(); this.brushes = [...data.brushes];
    for (const polygon of data.polygons) {
      const xs = polygon.vertices.map(p => p[0]), zs = polygon.vertices.map(p => p[2]);
      for (let x = Math.floor(Math.min(...xs) / 4); x <= Math.floor(Math.max(...xs) / 4); x++) {
        for (let z = Math.floor(Math.min(...zs) / 4); z <= Math.floor(Math.max(...zs) / 4); z++) {
          const key = `${x},${z}`;
          if (!this.cells.has(key)) this.cells.set(key, []);
          this.cells.get(key).push(polygon);
        }
      }
    }
  }

  canStand(x, y, z) {
    const gx = x * 32, gy = -z * 32, gz = (y + 1.125) * 32;
    let index = this.data.headnode;
    for (let i = 0; index >= 0 && i < 1024; i++) {
      const [plane, front, back] = this.data.clipnodes[index], [a, b, c, distance] = this.data.planes[plane];
      index = gx * a + gy * b + gz * c - distance >= 0 ? front : back;
    }
    if (index === -2 || index >= 0) return false;
    return !this.brushes.some(([low, high]) => low[0] - 0.5 < x && x < high[0] + 0.5 && low[2] - 0.5 < z && z < high[2] + 0.5 && y + 0.06 < high[1] && y + 2.2 > low[1]);
  }

  ground(x, z, reference, maxRise = 0.64, maxDrop = 1.4) {
    let best = -Infinity;
    for (const polygon of this.cells.get(`${Math.floor(x / 4)},${Math.floor(z / 4)}`) || []) {
      const [nx, ny, nz] = polygon.normal, height = (polygon.distance - nx * x - nz * z) / ny;
      if (height > reference + maxRise || height < reference - maxDrop || height < best) continue;
      if (insidePolygon(x, z, polygon.vertices)) best = height;
    }
    return best;
  }

  move(position, dx, dz, ground) {
    let height = ground;
    for (const [x, z] of [[position.x + dx, position.z], [null, position.z + dz]]) {
      const targetX = x ?? position.x;
      const floor = this.ground(targetX, z, height);
      if (!Number.isFinite(floor)) continue;
      if (this.canStand(targetX, Math.max(floor, height) + 0.04, z) && this.canStand(targetX, floor + 0.04, z)) {
        position.x = targetX; position.z = z; height = floor;
      }
    }
    return height;
  }
}

class Heap {
  constructor() { this.items = []; }
  push(value) {
    this.items.push(value); let i = this.items.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (this.items[p].cost <= value.cost) break; this.items[i] = this.items[p]; i = p; }
    this.items[i] = value;
  }
  pop() {
    const first = this.items[0], last = this.items.pop();
    if (this.items.length) {
      let i = 0;
      while (i * 2 + 1 < this.items.length) {
        let next = i * 2 + 1;
        if (next + 1 < this.items.length && this.items[next + 1].cost < this.items[next].cost) next++;
        if (this.items[next].cost >= last.cost) break;
        this.items[i] = this.items[next]; i = next;
      }
      this.items[i] = last;
    }
    return first;
  }
}

export class NavigationGraph {
  constructor(data) {
    this.nodes = data.nodes; this.links = data.links; this.step = data.step; this.columns = new Map();
    this.nodes.forEach((point, index) => {
      const key = `${Math.round(point[0] / this.step)},${Math.round(point[2] / this.step)}`;
      if (!this.columns.has(key)) this.columns.set(key, []);
      this.columns.get(key).push(index);
    });
  }
  nearest(point) {
    let closest = -1, score = Infinity;
    const x = Math.round(point.x / this.step), z = Math.round(point.z / this.step);
    for (let radius = 0; radius <= 4; radius++) {
      for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
        if (radius && Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
        for (const index of this.columns.get(`${x + dx},${z + dz}`) || []) {
          const p = this.nodes[index], cost = (p[0] - point.x) ** 2 + (p[2] - point.z) ** 2 + ((p[1] - point.y) * 2) ** 2;
          if (cost < score) { score = cost; closest = index; }
        }
      }
      if (closest >= 0 && score < (radius + 1) ** 2 * this.step ** 2) break;
    }
    return closest;
  }
  path(start, goal) {
    const source = this.nearest(start), target = this.nearest(goal);
    if (source < 0 || target < 0 || source === target) return [];
    const costs = new Float64Array(this.nodes.length); costs.fill(Infinity); costs[source] = 0;
    const parents = new Int32Array(this.nodes.length); parents.fill(-1);
    const closed = new Uint8Array(this.nodes.length), heap = new Heap(); heap.push({ index: source, cost: 0 });
    const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    while (heap.items.length) {
      const { index } = heap.pop();
      if (closed[index]) continue;
      if (index === target) {
        const points = []; let current = target;
        while (current !== source && current >= 0) { const p = this.nodes[current]; points.unshift({ x: p[0], y: p[1], z: p[2] }); current = parents[current]; }
        return points;
      }
      closed[index] = 1;
      for (const next of this.links[index]) {
        const cost = costs[index] + distance(this.nodes[index], this.nodes[next]);
        if (closed[next] || cost >= costs[next]) continue;
        costs[next] = cost; parents[next] = index;
        heap.push({ index: next, cost: cost + distance(this.nodes[next], this.nodes[target]) });
      }
    }
    return [];
  }
  nearbySpawns(point) {
    const source = this.nearest(point);
    if (source < 0) return [];
    const seen = new Set([source]), queue = [[source, 0]], found = [];
    for (let i = 0; i < queue.length; i++) {
      const [current, cost] = queue[i], p = this.nodes[current];
      if (cost > 11 && cost < 22 && Math.hypot(p[0] - point.x, p[2] - point.z) > 8) found.push(p);
      if (cost > 23) continue;
      for (const next of this.links[current]) if (!seen.has(next)) { seen.add(next); queue.push([next, cost + this.step]); }
    }
    return found;
  }
}
